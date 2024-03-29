import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { createVNode } from 'vue';
import { Peer } from 'peerjs'
import { isPad, getStuClass, getStuName, getStuId } from '@/utils/07future'
import { FileTransfer, NUM_OF_SUB_CONNS } from './FileTransfer'
import { Role } from './Enums'
import DeviceInfo from '@/utils/DeviceInfo'
import PeerJSError from './PeerJSError'

export class MainConnection {
    constructor(fileList, updateConnecting, updateFileListRecv, updateTransferSpeed) {
        this.role = Role.INITIATOR
        this.peer = new Peer({ debug: 2 })
        this.initiatorPeerId = ''
        this.peerId = ''
        this.peerInfo = null
        this.conn = null
        this.fileTransfer = null
        this.fileList = fileList
        this.lastHeartbeat = -1
        this.updateConnecting = updateConnecting
        this.updateFileListRecv = updateFileListRecv
        this.updateTransferSpeed = updateTransferSpeed

        this.peer.on('error', this.handlePeerJSError.bind(this))
    }

    init(initiatorPeerId) {
        this.initiatorPeerId = initiatorPeerId
        if (!initiatorPeerId) {
            // 发起端
            this.role = Role.INITIATOR

            // 创建新的会话
            this.peer.on('open', (id) => {
                this.peerId = id
            })
        } else {
            // 接入端
            this.role = Role.CONNECTOR

            // 加入现有会话
            this.peer.on('open', (id) => {
                this.peerId = id
                this.handleConnection(this.peer.connect(initiatorPeerId, { reliable: true, serialization: 'json' }))
            })
        }

        // 监听连接
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn)
        })

        // 监听连接关闭
        this.peer.on('disconnected', () => {
            // console.log('peer disconnected')
        })
    }

    handshake() {
        this.send('handshake', {
            device: {
                type: DeviceInfo.getDeviceType(),
                name: DeviceInfo.getDeviceName(),
                // 如果isPad为true，还要加一个07future字段
                ...(isPad()
                    ? {
                        '07future': {
                            stuId: getStuId(),
                            stuName: getStuName(),
                            stuClass: getStuClass()
                        }
                    }
                    : {})
            },
            fileTransfer: {
                numOfSubConns: NUM_OF_SUB_CONNS
            }
        })
    }

    send(type, detail) {
        // 发送数据
        this.conn.send({
            type,
            detail
        })
    }

    disconnect() {
        this.updateConnecting(false)
        this.peer.disconnect()
    }

    close() {
        this.updateConnecting(false)
        if (this.conn) {
            if(this.conn._open) {
                this.conn.close()
            }
            this.conn = null
        }
        if (this.fileTransfer) {
            this.fileTransfer.close()
            this.fileTransfer = null
        }
    }

    destroy() {
        this.updateConnecting(false)
        if (this.role == Role.CONNECTOR) {
            this.close()
        }
        if (this.fileTransfer && this.fileTransfer.speedBenchmark) {
            this.fileTransfer.speedBenchmark.destroy()
        }
        this.peer.destroy()
    }

    setGoHomeHandler(goHome) {
        this.goHome = goHome
    }

    addPeerJSErrorListenner(callback) {
        this.peer.on('error', callback)
    }

    handleConnection(conn) {
        if (this.conn) {
            // 判断是否为当前连接的子连接
            if (this.conn.peer == conn.peer) {
                // 如果是，添加到子连接列表
                this.fileTransfer.handleConnection(conn)
            } else {
                // 如果不是，拒绝连接
                conn.on('open', () => {
                    conn.send({
                        type: 'refuse'
                    })
                    setTimeout(() => {
                        conn.close()
                    }, 3000)
                })
            }
        } else {
            // 如果没有连接，直接接受连接
            this.conn = conn
            this.updateConnecting(true, null, '正在初始化连接...')

            this.conn.on('open', () => {
                // 监听数据事件
                this.conn.on('data', this.handleData.bind(this))

                if (this.role == Role.INITIATOR) {
                    // 发起握手
                    this.handshake()
                }

                // 发起首次心跳
                this.heartbeat()
            })

            // 监听连接关闭
            this.conn.on('close', () => {
                console.log('Connection closed')
                message.error('连接已断开')

                if(this.role == Role.CONNECTOR) {
                    // 如果是接入端，退出传输页面
                    this.goHome()
                }

                this.conn = null
                this.peerInfo = null
                this.lastHeartbeat = -1
                this.updateConnecting(false)
            })

            // 监听conn的peerConnection.connectionState，如果是failed，就重新创建
            conn.peerConnection.addEventListener('connectionstatechange', () => {
                if(conn.peerConnection.connectionState === 'failed') {
                    console.error('handleConnection: mainconn failed: ', conn)
                    this.conn = null
                    if(this.role == Role.CONNECTOR) {
                        this.handleConnection(this.peer.connect(this.initiatorPeerId, { reliable: true, serialization: 'json' }))
                    }
                }
            })
        }
    }

    handleData(data) {
        console.log('Received', data)
        const { type, detail } = data
        switch (type) {
            // 握手
            case 'handshake':
                this.peerInfo = detail.device

                // 初始化文件传输
                this.fileTransfer = new FileTransfer({
                    role: this.role,
                    peer: this.peer,
                    mainConn: this.conn,
                    mainConnSend: this.send.bind(this),
                    numOfSubConns: detail.fileTransfer.numOfSubConns,
                    fileList: this.fileList,
                    updateConnecting: this.updateConnecting,
                    updateFileListRecv: this.updateFileListRecv,
                    updateTransferSpeed: this.updateTransferSpeed,
                })

                // 接入端回复握手
                if (this.role == Role.CONNECTOR) {
                    this.handshake()
                }
                break

            // 心跳
            case 'ping':
                this.updateHeartbeat()
                this.send('pong')
                break

            case 'pong':
                this.updateHeartbeat()
                break

            // Worker连接
            case 'workerInitFinish':
                this.fileTransfer.connectWorker(detail.peerId)
                break

            // 文件传输
            case 'presend':
                this.fileTransfer.handlePresend(detail)
                break

            case 'presendReady':
                this.fileTransfer.handlePresendReady(detail)
                break

            // 网络环境评估
            case 'benchmarkResult':
                this.fileTransfer.speedBenchmark.stopTimeout()
                this.fileTransfer.speedBenchmark.result = detail.result
                this.fileTransfer.speedBenchmark.showResult(detail.speed, detail.failedPercent)
                this.updateConnecting(false)
                break

            // 拒绝连接
            case 'refuse':
                message.error('会话已有连接，无法加入')
                this.role = Role.REJECTEE
                this.conn.close()
                this.goHome()
                break

            default:
                message.error('接收到不支持的数据')
        }
    }

    heartbeat() {
        // 心跳
        if (!this.conn) {
            // 没有连接，不发送心跳
            return
        }
        if (!this.conn._open) {
            // 连接已关闭，退出传输页面
            message.error('连接已断开')
            this.close()
            return
        }
        if (this.lastHeartbeat != -1 && Date.now() - this.lastHeartbeat > 15000) {
            // 15秒未收到心跳，断开连接
            message.error('咦，好像断开连接了')
            this.close()
            return
        }
        if(this.role == Role.INITIATOR) {
            this.send('ping')
        }
        setTimeout(this.heartbeat.bind(this), 5000)
    }

    updateHeartbeat() {
        this.lastHeartbeat = Date.now()
    }
    
    tryReconnect() {
        if(this.peer.destroyed) {
            this.goHome()
            return Promise.resolve()
        }
        return new Promise((resolve, reject) => {
            let retryCount = 0
            let retryInterval = setInterval(() => {
                if(this.peer.destroyed) {
                    console.log('tryReconnect: peer destroyed')
                    clearInterval(retryInterval)
                    resolve()
                    return
                }
                if (!this.peer.disconnected) {
                    console.log('tryReconnect: reconnected')
                    clearInterval(retryInterval)
                    resolve()
                    return
                }
                if (retryCount >= 5) {
                    console.log('tryReconnect: reconnect failed')
                    clearInterval(retryInterval)
                    reject()
                    message.error('重连失败')
                    this.goHome()
                    return
                }
                retryCount++
                console.log('tryReconnect: reconnecting...')
                this.peer.reconnect()
            }, 2000)
        })
    }

    handlePeerJSError(err) {
        // console.log(err.type, err)

        switch (err.type) {
            case PeerJSError.PeerErrorType.Network:
                this.tryReconnect().catch(() => {
                    Modal.confirm({
                        title: '咦，好像断开连接了',
                        icon: createVNode(ExclamationCircleOutlined),
                        content: '是否尝试重新连接？',
                        okText: '重新连接',
                        cancelText: '退出',
                        onOk: this.tryReconnect.bind(this),
                        onCancel: () => {
                            this.goHome()
                        },
                    })
                })
                break
        }
    }
}
