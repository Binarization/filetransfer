import { Role } from "./Enums"
import { message, Modal } from 'ant-design-vue'

export class SpeedBenchmark {
    constructor({
        role = Role.INITIATOR, 
        mainConn = null,
        conns = [], 
        chunkSize = 1024 * 1024,
        createSubConnIfNeeded = null, 
        updateConnecting = null,
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

        this.createSubConnIfNeeded = createSubConnIfNeeded
        this.updateConnecting = updateConnecting
    }

    run() {
        if (this.running) {
            return
        }
        this.running = true
        this.result = -1
        this.startTimestamp = Date.now()
        console.log('SpeedBenchmark: start')
        if(this.role === Role.INITIATOR) {
            this.conns.forEach(conn => {
                this.ongoningConns.push(conn)
                conn.send({
                    type: 'benchmark',
                    chunk: this.chunk,
                })
            })

            // 保底机制
            // 60s后如果还有连接没有返回结果，就认为剩余的连接全部超时，并关闭连接
            this.timeout = setTimeout(() => {
                this.ongoningConns.forEach(conn => {
                    conn.close()
                })
                this.finish()
            }, 60 * 1000)
        } else {
            this.ongoningConns = [...this.conns]
        }
    }

    onConnDone(conn) {
        this.ongoningConns = this.ongoningConns.filter(c => c.label !== conn.label)
        this.records.push(new Date().getTime() - this.startTimestamp)
        if (this.role === Role.INITIATOR && this.ongoningConns.length === 0) {
            clearTimeout(this.timeout)
            this.finish()
        }
        console.log('SpeedBenchmark: onConnDone', this.ongoningConns.length, this.conns.length)
        this.updateConnecting(this.ongoningConns.length !== 0, null, `正在评估网络质量(${Math.round((1 - this.ongoningConns.length / this.conns.length) * 100)}%)...`)
    }

    finish() {
        // 计算平均传输时间(s)
        let totalTime = this.records.reduce((acc, cur) => acc + cur, 0) / this.records.length / 1000
        // 计算总传输量(MB)
        let totalSize = this.chunkSize * (this.conns.length - this.ongoningConns.length) / 1024 / 1024
        // 计算传输速率(MB/s)
        this.result = totalSize / totalTime
        let failedPercent = (this.conns.length - this.records.length) / this.conns.length
        this.mainConn.send({
            type: 'benchmarkResult',
            detail: {
                speed: this.result,
                failedPercent
            },
        })
        this.showResult(this.result, failedPercent)
        this.createSubConnIfNeeded()
        this.running = false
    }

    showResult(speed, failedPercent) {
        console.log('SpeedBenchmark: finish', `${speed}MB/s`, `${failedPercent * 100}%`)
        if(speed >= 6 && failedPercent < 0.1) {
            message.success('当前连接质量优秀')
        } else if(speed >= 3 && failedPercent < 0.1) {
            message.success('当前连接质量良好')
        } else if(speed >= 1 && failedPercent < 0.2) {
            message.warning('当前连接质量一般')
        } else {
            Modal.warn({
                title: '当前连接质量较差',
                content: '哎呀！当前网络环境较差，Direct Transfer可能无法发挥最佳性能，建议您将两端设备连接到同一网络下。',
                okText: '我知道了',
            })
        }
    }

    destroy() {
        clearTimeout(this.timeout)
    }
}