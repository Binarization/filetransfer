import { Role } from "./Enums"
import { message, Modal } from 'ant-design-vue'

export class SpeedBenchmark {
    constructor({
        role = Role.INITIATOR, 
        mainConn = null,
        conns = [], 
        chunkSize = 2 * 1024 * 1024,
        createSubConnIfNeeded = null, 
        updateConnecting = null,
        onFinish = null,
    } = {}){
        this.role = role
        this.mainConn = mainConn
        this.conns = conns
        this.ongoningConns = []
        this.chunkSize = chunkSize
        this.chunk = new ArrayBuffer(chunkSize)
        this.records = []
        this.result = -1
        this.running = false
        this.startTimestamp = 0
        this.timeout = null
        this.isTimeout = false
        this.finishSent = false

        this.createSubConnIfNeeded = createSubConnIfNeeded
        this.updateConnecting = updateConnecting
        this.onFinish = onFinish
    }

    async run() {
        if (this.running) {
            return
        }
        this.running = true
        this.result = -1
        this.startTimestamp = Date.now()
        console.log('SpeedBenchmark: start')
        if(this.role === Role.INITIATOR) {
            for(let conn of this.conns) {
                this.ongoningConns.push(conn)
                conn.send({
                    type: 'benchmark',
                    chunk: this.chunk,
                })
                // 随机延时50~100ms
                await new Promise((resolve) => {
                    setTimeout(resolve, Math.random() * 50 + 50)
                })
            }
            this.finishSent = true
        } else {
            this.ongoningConns = [...this.conns]
        }

        // 如果超时(0.1MB/s)还有连接没有返回结果，就认为剩余的连接全部超时，并关闭连接
        this.timeout = setTimeout(() => {
            this.ongoningConns.forEach(conn => {
                this.isTimeout = true
                conn.close()
            })
            this.finish()
        }, this.chunkSize / 1024 / 1024 / 0.4 * 1000 + 5000)
    }

    onConnDone(conn) {
        console.log('onConnDone', this.ongoningConns)
        this.ongoningConns = this.ongoningConns.filter(c => c.label !== conn.label)
        console.log('onConnDone', this.ongoningConns)
        this.records.push(new Date().getTime() - this.startTimestamp)
        if (this.finishSent && this.ongoningConns.length === 0) {
            this.stopTimeout()
            console.log('onConnDone: call finish()')
            this.finish()
        }
        this.updateConnecting(this.ongoningConns.length !== 0, null, `正在评估网络质量(${Math.round((1 - this.ongoningConns.length / this.conns.length) * 100)}%)...`)
    }

    stopTimeout() {
        clearTimeout(this.timeout)
    }

    finish() {
        // 计算平均传输时间(s)
        let totalTime = this.records.reduce((acc, cur) => acc + cur, 0) / this.records.length / 1000
        // 计算总传输量(MB)
        let totalSize = this.chunkSize / 1024 / 1024
        // 计算传输速率(MB/s)
        this.result = totalSize / totalTime
        let failedPercent = (this.conns.length - this.records.length) / this.conns.length
        if(this.role === Role.INITIATOR && !this.isTimeout) {
            this.mainConn.send({
                type: 'benchmarkResult',
                detail: {
                    speed: this.result,
                    failedPercent
                },
            })
        }
        this.running = false
        this.showResult(this.result, failedPercent)
        this.updateConnecting(false)
        this.createSubConnIfNeeded()
    }

    showResult(speed, failedPercent) {
        if(this.onFinish) {
            this.onFinish()
        }
        console.log('SpeedBenchmark: finish', `${speed}MB/s`, `${failedPercent * 100}%`, `getTimeoutLength: ${this.getTimeoutLength(4 * 1024 * 1024, 0)}`)
        if(this.isTimeout) {
            this.showBadNetworkModal()
            return
        }
        if(speed > 0.6 && failedPercent < 0.1) {
            message.success('当前连接质量优秀')
        } else if(speed > 0.4 && failedPercent < 0.3) {
            message.success('当前连接质量良好')
        } else if(speed > 0.1 && failedPercent < 0.5) {
            message.warning('当前连接质量一般')
        } else {
            this.showBadNetworkModal()
        }
    }

    showBadNetworkModal() {
        Modal.warn({
            title: '当前网络环境较差',
            content: 'Direct Transfer可能无法发挥最佳性能，建议您将两端设备连接到同一网络下。',
            okText: '我知道了',
        })
    }

    getTimeoutLength(size, retry) {
        if(this.isTimeout) {
            return -1
        }
        let base = size / 1024 / 1024 / this.result * 1000 * 2 * (1 + 0.5 * retry)
        console.log(base)
        // 确保最小超时时间为5s，并添加随机时间（2~5s），防止同时发起的连接同时超时
        return Math.max(base + Math.random() * 3000 + 2000, 5000)
    }

    skip() {
        this.stopTimeout()
        this.running = false
        this.isTimeout = true
        this.onFinish()
    }

    destroy() {
        clearTimeout(this.timeout)
    }
}