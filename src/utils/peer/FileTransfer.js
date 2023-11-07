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
        console.log('FileTransfer: ', new Date().getTime())
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
        this.subConns.push(conn)
        this.idleSubConns.push(conn)
    }

    isSubConnsReady() {
        return this.subConns.length === this.numOfSubConns
    }

    close() {
        // TODO
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
            this.idleSubConns.push(conn)
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