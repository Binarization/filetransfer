import { message } from "ant-design-vue"
import { Role } from "./Enums"

export const numOfSubConns = 8

export class FileTransfer {
    constructor({
        role = '', 
        peer = null, 
        mainConn = null, 
        mainConnSend = null,
        numOfSubConns = numOfSubConns, 
        fileList = null,
        updateFileListRecv = null,
    } = {}){
        this.chunkSize = 20 * 1024 * 1024 // 20MB
        this.role = role
        this.peer = peer
        this.mainConn = mainConn
        this.mainConnSend = mainConnSend
        this.subConns = []
        this.idleSubConns = []
        this.numOfSubConns = numOfSubConns
        this.fileList = fileList
        this.updateFileListRecv = updateFileListRecv

        this.preSendFileList = {}
        this.sendingFileList = []
        this.receivingFileList = {}

        if(this.role === Role.INITIATOR) {
            this.createSubConn()
        }
    }

    createSubConn() {
        this.handleConnection(this.peer.connect(this.mainConn.peer, { reliable: true }))
    }

    appendSubConn(conn) {
        console.log('subconn added: ', conn)
        conn.fileReaderWorker = new Worker(new URL('@/workers/FileReader.worker.js', import.meta.url))
        this.subConns.push(conn)
        this.idleSubConns.push(conn)
    }

    isSubConnsReady() {
        return this.subConns.length === this.numOfSubConns
    }

    isTransferring() {
        return this.sendingFileList.length > 0 || Object.keys(this.receivingFileList).length > 0
    }

    close() {
        this.subConns.forEach(conn => {
            conn.close()
            conn.fileReaderWorker.terminate()
        })
    }

    handleConnection(conn) {
        conn.on('open', () => {
            this.appendSubConn(conn)
            if(this.role === Role.INITIATOR && !this.isSubConnsReady()) {
                this.createSubConn()
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
        console.log('checkQueue: ', this.idleSubConns.length, this.sendingFileList.length)
        while(this.idleSubConns.length > 0 && this.sendingFileList.length > 0) {
            let conn = this.idleSubConns.shift()
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
        conn.fileReaderWorker.onmessage = (e) => {
            switch(typeof(e.data)) {
                case 'object':
                    conn.send({
                        uid: file.file.uid,
                        index: chunk.index,
                        arrayBuffer: e.data,
                    })
                    file.sended += chunk.blob.size
                    file.file.percent = parseInt(file.sended / file.file.size * 100)
                    file.onProgress(file.file)
                    if(file.sended === file.file.size) {
                        file.file.status = 'done'
                        file.onSuccess(file.file)
                    }
                    this.idleSubConns.push(conn)
                    this.checkQueue()
                    break
                
                case 'string':
                    console.error(e.data)
                    file.file.status = 'error'
                    file.onError(file.file)
                    break
                
                default:
                    console.error('worker: unknown message: ', e.data)
                    break
                }
        }
        conn.fileReaderWorker.postMessage(chunk.blob)
        this.checkQueue()
    }

    async handleChunk(uid, index, arrayBuffer) {
        // console.log('handleChunk: ', uid, index, arrayBuffer, this.receivingFileList[uid])
        let chunks = this.receivingFileList[uid].chunks
        let received = this.receivingFileList[uid].received
        let size = this.receivingFileList[uid].size
        chunks[index] = arrayBuffer

        // console.log('receive blob: ', chunks[index])
        // 更新进度
        received += chunks[index].byteLength
        this.receivingFileList[uid].received = received
        this.updateFileListRecv({
            uid, 
            percent: parseInt(received / size * 100),
        })

        chunks[index] = new Uint8Array()
        
        // 检查当前文件是否传输完毕
        if(received === this.receivingFileList[uid].size) {
            this.updateFileListRecv({
                uid, 
                status: 'done',
                percent: 100,
                file: await this.chunksToFile(uid)
            })
            delete this.receivingFileList[uid]
            // console.log('receive done: ', this.fileList.receive)
        }
    }

    async chunksToFile(uid) {
        let chunks = this.receivingFileList[uid].chunks
        let type = this.receivingFileList[uid].type
        // 合并ArrayBuffer
        let arrayBuffer = new ArrayBuffer(this.receivingFileList[uid].size)
        let received = 0
        for(let i = 0; i < chunks.length; i++) {
            let chunk = chunks[i]
            new Uint8Array(arrayBuffer).set(new Uint8Array(chunk), received)
            received += chunk.byteLength
        }
        // 生成Blob
        let blob = new Blob([arrayBuffer], { type })
        // 生成File
        let file = new File([blob], this.receivingFileList[uid].file.name, { type })
        file.uid = uid
        return file
    }
}