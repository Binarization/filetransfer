import localForage from 'localforage'
import { Role } from "./Enums"

export const numOfSubConns = 12

export class FileTransfer {
    constructor({
        role = '', 
        peer = null, 
        mainConn = null, 
        mainConnSend = null,
        numOfSubConns = numOfSubConns, 
        fileList = null,
        updateConnecting = null,
        updateFileListRecv = null,
    } = {}){
        this.chunkSize = 16 * 1024 * 1024
        this.role = role
        this.peer = peer
        this.mainConn = mainConn
        this.mainConnSend = mainConnSend
        this.subConns = []
        this.idleSubConns = []
        this.numOfSubConns = numOfSubConns
        this.fileList = fileList
        this.updateConnecting = updateConnecting
        this.updateFileListRecv = updateFileListRecv

        this.preSendFileList = {}
        this.sendingFileList = []
        this.receivingFileList = {}

        this.transferringChunks = {}
        this.transferringConns = {}

        // 清空localForage
        localForage.clear()

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
        this.updateConnecting(!this.isSubConnsReady())
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
        
        // 清空localForage
        localForage.clear()
    }

    handleConnection(conn) {
        conn.on('open', () => {
            this.appendSubConn(conn)
            if(this.role === Role.INITIATOR && !this.isSubConnsReady()) {
                this.createSubConn()
            }
            conn.on('data', (data) => this.handleData(conn, data))
        })
    }

    async handleData(conn, data) {
        console.log('handleData: ', data)
        const { type, detail } = data
        switch(type) {
            case 'areYouReady':
                // 预先将子连接从空闲队列中移除
                this.idleSubConns.splice(this.idleSubConns.indexOf(conn), 1)
                this.transferringChunks[detail.id] = {
                    conn, 
                }
                this.transferringConns[conn.connectionId] = {
                    uid: detail.uid,
                    index: detail.index,
                }
                this.sendIAmReady(conn, detail.id)
                break
            
            case 'iAmReady':
                this.sendChunk(detail.id)
                break
            
            case 'chunk':
                if(this.receivingFileList[detail.uid]) {
                    this.handleChunk(detail.uid, detail.index, detail.uint8Array).then(() => {
                        this.sendDone(conn, `${detail.uid}-${detail.index}`)
                        delete this.transferringChunks[`${detail.uid}-${detail.index}`]
                        delete this.transferringConns[conn.connectionId]

                        // 检查当前文件是否传输完毕
                        this.checkFileDone(detail.uid)
                    })
                }
                break
            
            case 'done':
                this.handleDone(detail)
                break

            default:
                console.error('Unknown message: ', data)
                break
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
        console.log('presend: ', 'chucks: ', chucks)

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
            size: detail.size,
            type: detail.type,
        }
        this.receivingFileList[detail.uid] = {
            received: 0,
            numOfChunks: detail.numOfChunks,
            size: detail.size,
            type: detail.type,
            file, 
        }
        console.log(file)
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

            this.sendAreYouReady(conn, file, chunk)
        }
    }

    sendAreYouReady(conn, file, chunk) {
        const uid = file.file.uid
        const index = chunk.index
        const id = `${uid}-${index}`
        this.transferringChunks[id] = {
            conn, 
            file, 
            chunk,
        }
        this.transferringConns[conn.connectionId] = {
            uid, 
            index,
        }
        conn.send({
            type: 'areYouReady',
            detail: {
                id, 
                uid, 
                index,
            }
        })
    }

    sendIAmReady(conn, id) {
        conn.send({
            type: 'iAmReady',
            detail: {
                id
            }
        })
    }

    sendDone(conn, id) {
        conn.send({
            type: 'done',
            detail: {
                id
            }
        })
    }

    handleDone(detail) {
        const { conn, file, chunk } = this.transferringChunks[detail.id]
        file.sended += chunk.blob.size
        file.file.percent = parseInt(file.sended / file.file.size * 100)
        file.onProgress(file.file)
        if(file.sended === file.file.size) {
            file.file.status = 'done'
            file.onSuccess(file.file)
        }
        delete this.transferringChunks[detail.id]
        delete this.transferringConns[conn.connectionId]
        this.idleSubConns.push(conn)
        this.checkQueue()
    }

    async sendChunk(id) {
        const { conn, file, chunk } = this.transferringChunks[id]
        conn.fileReaderWorker.onmessage = (e) => {
            switch(typeof(e.data)) {
                case 'object':
                    conn.send({
                        type: 'chunk',
                        detail: {
                            uid: file.file.uid,
                            index: chunk.index,
                            uint8Array: e.data,
                        }
                    })
                    break
                
                case 'string':
                    console.error('fileReaderWorker error: ', e.data)
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

    async handleChunk(uid, index, uint8Array) {
        const chunkId = `${uid}-${index}`
        console.time(`save chunk ${chunkId}`)
        await localForage.setItem(chunkId, uint8Array)
        console.timeEnd(`save chunk ${chunkId}`)

        // 更新进度
        let received = this.receivingFileList[uid].received
        let size = this.receivingFileList[uid].size

        received += uint8Array.byteLength
        this.receivingFileList[uid].received = received
        this.updateFileListRecv({
            uid, 
            percent: parseInt(received / size * 100),
        })
    }

    async checkFileDone(uid) {
        let received = this.receivingFileList[uid].received
        // 检查当前文件是否传输完毕
        if(received === this.receivingFileList[uid].size) {
            console.log('checkFileDone: ', uid)
            const file = await this.chunksToFile(uid)
            this.updateFileListRecv({
                uid, 
                status: 'done',
                percent: 100,
            })

            // 判断文件是否为图片
            if(this.receivingFileList[uid].type.startsWith('image')) {
                // 生成缩略图
                this.createThumbnail(file).then(thumbUrl => {
                    this.updateFileListRecv({
                        uid, 
                        thumbUrl,
                    })
                })
            }

            // 浏览器下载文件
            const a = document.createElement('a')
            a.href = URL.createObjectURL(file)
            a.download = file.name
            a.click()

            delete this.receivingFileList[uid]
            // console.log('receive done: ', this.fileList.receive)
        }
    }

    async chunksToFile(uid) {
        console.log('chunksToFile: ', uid)
        let chunks = []
        let numOfChunks = this.receivingFileList[uid].numOfChunks
        for(let i = 0; i < numOfChunks; i++) {
            chunks.push(await localForage.getItem(`${uid}-${i}`))
            localForage.removeItem(`${uid}-${i}`)
        }
        let type = this.receivingFileList[uid].type
        // 生成Blob
        let blob = new Blob(chunks, { type })
        // 生成File
        let file = new File([blob], this.receivingFileList[uid].file.name, { type })
        file.uid = uid
        return file
    }

    async createThumbnail(file) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            const img = new Image()
            img.onload = () => {
                const { width, height } = img
                const ratio = width / height
                const thumbnailWidth = 320
                const thumbnailHeight = thumbnailWidth / ratio
                canvas.width = thumbnailWidth
                canvas.height = thumbnailHeight
                ctx.drawImage(img, 0, 0, thumbnailWidth, thumbnailHeight)
                canvas.toBlob((blob) => {
                    const reader = new FileReader()
                    reader.onload = () => {
                        resolve(reader.result)
                    }
                    reader.readAsDataURL(blob)
                })
            }
            img.src = URL.createObjectURL(file)
        })
    }
}