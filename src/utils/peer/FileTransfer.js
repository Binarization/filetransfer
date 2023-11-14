import localForage from 'localforage'
import { Role } from "./Enums"
import { SpeedBenchmark } from './SpeedBenchmark'

export const NUM_OF_SUB_CONNS = 24

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
        updateTransferSpeed = null,
    } = {}){
        this.chunkSize = 4 * 1024 * 1024
        this.closed = false
        this.role = role
        this.peer = peer
        this.mainConn = mainConn
        this.mainConnSend = mainConnSend
        this.subConns = []
        this.idleSubConns = []
        this.numOfPreSubConns = 0
        this.numOfSubConns = 10
        this.speedBenchmark = new SpeedBenchmark({
            role: this.role,
            mainConn: this.mainConn,
            createSubConnIfNeeded: this.createSubConnIfNeeded.bind(this),
            updateConnecting: updateConnecting,
            onFinish: () => {
                // 评估完成，继续创建子连接
                this.numOfSubConns = NUM_OF_SUB_CONNS
                this.createSubConnIfNeeded()
            }
        })

        this.fileList = fileList
        this.updateConnecting = updateConnecting
        this.updateFileListRecv = updateFileListRecv
        this.updateTransferSpeed = updateTransferSpeed

        this.preSendFileList = {}
        this.sendingFileList = []
        this.unfinishedChunks = []
        this.receivingFileList = {}

        this.transferringChunks = {}
        this.transferringConns = {}

        this.recentChunkSizes = []

        // 清空localForage
        localForage.clear()

        if(this.role === Role.INITIATOR) {
            this.createSubConnIfNeeded()
        }
        
        this.calcAverageTransferSpeed()
    }

    createSubConnIfNeeded() {
        if(this.speedBenchmark.running) {
            // 当前正在评估网络质量，不创建新连接，避免影响评估结果
            return
        }
        if(this.role === Role.INITIATOR && !this.isSubConnsReady() && this.mainConn._open) {
            if(this.numOfSubConns - this.numOfPreSubConns > 2) {
                console.log('createSubConnIfNeeded: ', this.numOfSubConns, this.numOfPreSubConns)
                this.numOfPreSubConns++
                console.log('createSubConnIfNeeded: this.numOfPreSubConns++')
                this.handleConnection(this.peer.connect(this.mainConn.peer, { reliable: true }))
            }
            this.numOfPreSubConns++
            console.log('createSubConnIfNeeded: this.numOfPreSubConns++')
            this.handleConnection(this.peer.connect(this.mainConn.peer, { reliable: true }))
        }
    }

    appendSubConn(conn) {
        console.log('subconn added: ', conn)
        conn.fileReaderWorker = new Worker(new URL('@/workers/FileReader.worker.js', import.meta.url))
        this.subConns.push(conn)
        this.idleSubConns.push(conn)
        this.checkQueue()
        if(this.subConns.length < this.numOfSubConns && this.speedBenchmark.result === -1) {
            this.updateConnecting(true, `${this.subConns.length}/${this.numOfSubConns}`, `正在建立子连接(${Math.round(this.subConns.length / this.numOfSubConns * 100)}%)...`)
        } else {
            if(this.speedBenchmark.result === -1) {
                if(!this.speedBenchmark.running) {
                    this.updateConnecting(true, `${this.subConns.length}/${this.numOfSubConns}`, '正在评估网络质量(0%)...')
                    this.speedBenchmark.conns = [...this.subConns]
                    this.speedBenchmark.run()
                }
            } else {
                this.updateConnecting(false, `${this.subConns.length}/${this.numOfSubConns}`)
            }
        }   
    }

    isSubConnsReady() {
        return this.numOfPreSubConns === this.numOfSubConns
    }

    isTransferring() {
        return this.sendingFileList.length > 0 || Object.keys(this.receivingFileList).length > 0
    }

    recordChunkSize(size) {
        this.recentChunkSizes.push({
            time: Date.now(),
            size,
        })
    }

    // 计算最近10秒的平均传输速度(MB/s)
    calcAverageTransferSpeed() {
        // 先清除超过10秒的记录
        this.recentChunkSizes = this.recentChunkSizes.filter(record => Date.now() - record.time < 10000)

        let totalSize = 0
        this.recentChunkSizes.forEach(record => {
            totalSize += record.size
        })
        this.updateTransferSpeed(`${(totalSize / 10 / 1024 / 1024).toFixed(2)} MB/s`)
        if(!this.closed) {
            setTimeout(this.calcAverageTransferSpeed.bind(this), 1000)
        }
    }

    close() {
        this.closed = true
        if(this.speedBenchmark) {
            this.speedBenchmark.destroy()
        }
        this.subConns.forEach(conn => {
            if(conn._open) {
                conn.close()
            }
            conn.fileReaderWorker.terminate()
        })
        
        // 清空localForage
        localForage.clear()
    }

    handleConnection(conn) {
        conn.on('open', () => {
            conn.on('data', (data) => this.handleData(conn, data))
            this.appendSubConn(conn)
            this.createSubConnIfNeeded()
        })

        conn.on('close', () => {
            this.numOfPreSubConns--
            if(this.fileReaderWorker) conn.fileReaderWorker.terminate()
            this.subConns = this.subConns.filter(c => c.label !== conn.label)
            this.idleSubConns = this.idleSubConns.filter(c => c.label !== conn.label)
            this.updateConnecting(undefined, `${this.subConns.length}/${this.numOfSubConns}`)

            console.log('subconn closed: check chunk done: ', conn.connectionId, this.transferringConns, !!(this.transferringConns[conn.connectionId]))
            // 检查当前文件是否传输完毕
            if(this.transferringConns[conn.connectionId]) {
                const { uid, index } = this.transferringConns[conn.connectionId]
                const { file, chunk } = this.transferringChunks[`${uid}-${index}`]

                // 重新加入未完成队列
                if(this.fileList.send.find(file => file.uid === uid)) {
                    console.log('subconn closed: chunk readded: ', file)
                    this.unfinishedChunks.push({
                        file, 
                        chunk,
                    })
                    this.checkQueue()
                }

                delete this.transferringConns[conn.connectionId]
                delete this.transferringChunks[`${uid}-${index}`]
            }

            // 延时一秒检查是否需要重新创建，避免对方关闭连接未来得及更新closed状态
            setTimeout(() => {
                if(!this.closed && this.mainConn._open && this.subConns.length <= this.numOfSubConns) {
                    console.error('subconn closed unexpectedly: ', conn)
                    this.createSubConnIfNeeded()
                }
            }, 1000)
        })

        // 监听conn的peerConnection.connectionState，如果是failed，就重新创建
        conn.peerConnection.addEventListener('connectionstatechange', () => {
            if(conn.peerConnection.connectionState === 'failed') {
                console.error('handleConnection: subconn failed: ', conn)
                this.numOfPreSubConns--
                // 重新创建
                this.createSubConnIfNeeded()
            }
        })
    }

    async handleData(conn, data) {
        console.log('handleData: ', data)
        const { type, detail } = data
        switch(type) {
            case 'benchmark':
                conn.send({
                    type: 'benchmarkDone',
                })
                this.speedBenchmark.onConnDone(conn)
                break
            
            case 'benchmarkDone':
                this.speedBenchmark.onConnDone(conn)
                break

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
                        this.idleSubConns.push(conn)
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
        
        console.time(`send(conn: ${this.numOfPreSubConns}, chunkSize: ${this.chunkSize}) ` + detail.uid)
    }

    async checkQueue() {
        console.log('checkQueue: ', this.idleSubConns.length, this.sendingFileList.length, this.unfinishedChunks.length)
        while(this.idleSubConns.length > 0) {
            if(this.unfinishedChunks.length > 0) {
                let conn = this.idleSubConns.shift()
                let { file, chunk } = this.unfinishedChunks.shift()
                
                this.sendAreYouReady(conn, file, chunk)
            } else if(this.sendingFileList.length > 0) {
                let conn = this.idleSubConns.shift()
                let file = this.sendingFileList[0]
                let chunk = file.chucks.shift()

                // 检查当前文件是否传输完毕
                if(file.chucks.length === 0) {
                    this.sendingFileList.shift()
                }

                this.sendAreYouReady(conn, file, chunk)
            } else {
                break
            }
            // 随机延时50~100ms
            await new Promise((resolve) => {
                setTimeout(resolve, Math.random() * 50 + 50)
            })
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
        console.timeEnd(`send chunk: ${detail.id} `)
        const { conn, file, chunk } = this.transferringChunks[detail.id]

        // 清除超时定时器
        clearTimeout(conn.timeout)

        // 记录传输事件
        this.recordChunkSize(chunk.blob.size)

        // 更新进度
        file.sended += chunk.blob.size
        file.file.percent = parseInt(file.sended / file.file.size * 100)
        file.onProgress(file.file)
        if(file.sended === file.file.size) {
            console.timeEnd(`send(conn: ${this.numOfPreSubConns}, chunkSize: ${this.chunkSize}) ` + file.file.uid)
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
                    if(this.speedBenchmark.getTimeoutLength(chunk.blob.size) > 0) {
                        conn.timeout = setTimeout(() => {
                            console.error('send chunk timeout: ', conn, file, chunk)
                            conn.close()
                        }, this.speedBenchmark.getTimeoutLength(chunk.blob.size))
                    }
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
        console.time(`send chunk: ${id} `)
        conn.fileReaderWorker.postMessage(chunk.blob)
        this.checkQueue()
    }

    async handleChunk(uid, index, uint8Array) {
        const chunkId = `${uid}-${index}`
        await localForage.setItem(chunkId, uint8Array)

        // 记录传输事件
        this.recordChunkSize(uint8Array.byteLength)

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
        const chunkMergerWorker = new Worker(new URL('@/workers/ChunkMerger.worker.js', import.meta.url), { type: 'module' })
        chunkMergerWorker.postMessage({
            uid, 
            name: this.receivingFileList[uid].file.name,
            type: this.receivingFileList[uid].file.type,
            numOfChunks: this.receivingFileList[uid].numOfChunks,
        })
        return new Promise((resolve) => {
            chunkMergerWorker.onmessage = (e) => {
                console.log('chunksToFile: ', e.data)
                resolve(e.data)
            }
        })
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