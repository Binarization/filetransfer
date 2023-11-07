import { message } from "ant-design-vue"
import { Role } from "./Enums"

export const numOfWorkers = 8

export class FileTransfer {
    constructor({
        role = '', 
        peer = null, 
        mainConn = null, 
        mainConnSend = null,
        numOfWorkers = numOfWorkers, 
        fileList = null,
        updateFileListRecv = null,
    } = {}){
        this.chunkSize = 20 * 1024 * 1024 // 20MB
        this.role = role
        this.peer = peer
        this.mainConn = mainConn
        this.mainConnSend = mainConnSend
        this.workers = []
        this.idleWorkers = []
        this.numOfWorkers = numOfWorkers
        this.unpairedWorker = null
        this.targetUnpairedWorkerPeerId = null
        this.fileList = fileList
        this.updateFileListRecv = updateFileListRecv

        this.preSendFileList = {}
        this.sendingFileList = []
        this.receivingFileList = {}

        if(this.role === Role.INITIATOR) {
            this.createWorker()
        }
    }

    // 创建worker
    createWorker(){
        const worker = new Worker(new URL('@/utils/peer/SubConnection', import.meta.url), {
            type: 'module',
        })
        worker.onmessage = this.handleWorker.bind(this)
        worker.postMessage({
            type: 'init',
            detail: null,
        })
    }

    // 连接worker(接入端接收到发起端WorkerPeerId，开始创建worker并连接发起)
    connectWorker(peerId) {
        this.targetUnpairedWorkerPeerId = peerId
        this.createWorker()
    }

    // 成功建立连接，添加worker
    appendWorker(conn) {
        console.log('worker added: ', conn)
        this.workers.push(conn)
        this.idleWorkers.push(conn)
    }

    // 处理worker消息
    handleWorker(e) {
        console.log('handleWorker: ', e.data)
        const { type, detail } = e.data
        switch(type) {
            case 'initFinish':
                this.unpairedWorker = e.target
                if(this.role === Role.INITIATOR) {
                    // 发起端通知接入端创建worker
                    this.mainConnSend('workerInitFinish', {
                        peerId: detail.peerId,
                    })
                } else {
                    // 接入端worker连接发起端worker
                    this.unpairedWorker.postMessage({
                        type: 'connect',
                        detail: {
                            peerId: this.targetUnpairedWorkerPeerId,
                        }
                    })
                }
                break
            
            case 'connectFinish':
                console.log('handleWorker: worker connectFinish: ', e.target)
                // worker双向连接成功
                this.appendWorker(e.target)
                // 发起端检查是否已完成worker连接
                if(this.role === Role.INITIATOR && !this.isWorkersReady()) {
                    this.createWorker()
                }
                break

            default:
                console.error('handleWorker: ', '未知的消息类型: ', type)
        }
    }

    isWorkersReady() {
        return this.workers.length === this.numOfWorkers
    }

    close() {
        // TODO
    }

    handleConnection(conn) {
        conn.on('open', () => {
            this.appendWorker(conn)
            if(this.role === Role.CONNECTOR && !this.isWorkersReady()) {
                this.createWorker()
            }
            conn.on('data', this.handleData.bind(this))
        })
    }

    async handleData(data) {
        console.log('handleData: ', data)
        const { uid, index, arrayBuffer } = data
        if(this.receivingFileList[uid]) {
            this.handleChunk(uid, index, arrayBuffer)
        } else {
            console.error('Unpresend file: ', uid)
            message.error(`文件传输出错: 未预传文件(${uid})`)
        }
    }

    presend(file, onSuccess, onError, onProgress) {
        // console.log('presend: ', file)
        const chucks = []
        for(let i = 0; i < file.size; i += this.chunkSize) {
            const index = parseInt(i / this.chunkSize)
            // 文件切片
            chucks.push({
                index: index,
                blob: file.slice(i, this.chunkSize * (index + 1))
            })
        }
        this.preSendFileList[file.uid] = {
            file,
            chucks,
            sended: 0,
            onSuccess,
            onError,
            onProgress,
        }
        this.mainConnSend('presend', {
            uid: file.uid,
            name: file.name,
            size: file.size,
            type: file.type,
            numOfChunks: chucks.length,
        })
    }

    handlePresend(detail) {
        // console.log('handlePresend: ', detail)
        let file = {
            uid: detail.uid,
            name: detail.name,
            status: 'uploading',
            percent: 0,
        }
        this.receivingFileList[detail.uid] = {
            chunks: new Array(detail.numOfChunks),
            received: 0,
            size: detail.size,
            type: detail.type,
            file, 
        }
        this.fileList.receive.push(file)
        this.presendReady(detail.uid)
    }

    presendReady(uid) {
        this.mainConnSend('presendReady', {
            uid,
        })
    }

    handlePresendReady(detail) {
        // console.log('handlePresendReady: ', detail)
        this.sendingFileList.push(this.preSendFileList[detail.uid])
        delete this.preSendFileList[detail.uid]
        this.checkQueue()
    }

    async checkQueue() {
        console.log('checkQueue: ', this.idleWorkers.length, this.sendingFileList.length)
        while(this.idleWorkers.length > 0 && this.sendingFileList.length > 0) {
            let conn = this.idleWorkers.shift()
            let file = this.sendingFileList[0]
            let chunk = file.chucks.shift()

            // 检查当前文件是否传输完毕
            if(file.chucks.length === 0) {
                this.sendingFileList.shift()
            }

            this.sendChunk(conn, file, chunk)
        }
    }

    async sendChunk(conn, file, chunk) {
        console.log('sendChunk: ', conn, file)
        // 使用FileReader读取文件
        let reader = new FileReader()
        reader.readAsArrayBuffer(chunk.blob)
        reader.onload = () => {
            // console.log('onload: ', reader.result)
            let data = {
                uid: file.file.uid,
                index: chunk.index,
                arrayBuffer: reader.result,
            }
            conn.send(data)
            file.sended += chunk.blob.size
            file.file.percent = parseInt(file.sended / file.file.size * 100)
            file.onProgress(file.file)
            if(file.sended === file.file.size) {
                file.file.status = 'done'
                file.onSuccess(file.file)
            }
            this.idleWorkers.push(conn)
            this.checkQueue()
            data = null
            reader = null
        }
        reader.onerror = (err) => {
            console.error('read error: ', err)
            file.file.status = 'error'
            file.onError(file.file)
        }
    }

    async handleChunk(uid, index, arrayBuffer) {
        console.log('handleChunk: ', uid, index, arrayBuffer, this.receivingFileList[uid])
        let chunks = this.receivingFileList[uid].chunks
        let received = this.receivingFileList[uid].received
        let size = this.receivingFileList[uid].size
        chunks[index] = new Blob([arrayBuffer])

        
        console.log(this.fileList.receive[0])
        // 更新进度
        received += chunks[index].size
        this.receivingFileList[uid].received = received
        this.updateFileListRecv({
            uid, 
            percent: parseInt(received / size * 100),
        })
        
        // 检查当前文件是否传输完毕
        if(received === this.receivingFileList[uid].size) {
            this.updateFileListRecv({
                uid, 
                status: 'done',
                percent: 100,
                file: await this.chunksToFile(uid)
            })
            delete this.receivingFileList[uid]
            console.log('receive done: ', this.fileList.receive)
        }
    }

    async chunksToFile(uid) {
        let chunks = this.receivingFileList[uid].chunks
        let type = this.receivingFileList[uid].type
        let blob = new Blob(chunks)
        let file = new File([blob], uid, { type })
        file.uid = uid
        return file
    }
}