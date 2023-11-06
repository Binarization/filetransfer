import { message } from 'ant-design-vue'
import { Peer } from 'peerjs'
import { isPad, getStuClass, getStuName, getStuId } from '@/utils/07future'
import { FileTransfer } from './FileTransfer'
import { Role } from './Enums'
import DeviceInfo from '@/utils/DeviceInfo'
import PeerJSError from '@/utils/PeerJSError'

export class MainConnection {
    constructor() {
        this.role = Role.INITIATOR
        this.peer = new Peer({ debug: 2 })
        this.peerId = ''
        this.peerInfo = null
        this.conn = null
        this.fileTransfer = null
        this.numOfSubconns = 8
        this.lastHeartbeat = -1

        this.peer.on('error', (err) => this.handlePeerJSError(err))
    }

    init(initiatorPeerId) {
        if(!initiatorPeerId) {
            // 发起端
            this.role = Role.INITIATOR

            // 创建新的会话
            this.peer.on('open', (id) => {
                this.peerId = id
            })

            // 监听连接
            this.peer.on('connection', (conn) => {
                this.handleConnection(conn)
            })

            // 监听连接关闭
            this.peer.on('disconnected', () => {
                console.log('peer disconnected')
            })
        } else {
            // 接入端
            this.role = Role.CONNECTOR

            // 加入现有会话
            this.peer.on('open', (id) => {
                this.peerId = id
                this.handleConnection(this.peer.connect(initiatorPeerId, { reliable: true }))
            })
        }
    }

    send(type, detail) {
        // 发送数据
        this.conn.send(JSON.stringify({
            type,
            detail,
        }))
    }

    disconnect() {
        this.peer.disconnect()
    }

    close() {
        this.conn.close()
    }

    destroy() {
        if(this.role == Role.CONNECTOR) {
            if(this.conn) this.conn.close()
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
            if(this.conn.peer == conn.peer) {
                // 如果是，添加到子连接列表
                this.fileTransfer.appendSubconn(conn)
            } else {
                // 如果不是，拒绝连接
                conn.on('open', () => {
                    conn.send(JSON.stringify({
                        type: 'refuse'
                    }))
                    setTimeout(() => {
                        conn.close()
                    }, 3000)
                })
            }
        } else {
            // 如果没有连接，直接接受连接
            this.conn = conn
            
            this.conn.on('open', () => {
                // 监听数据事件
                this.conn.on('data', (data) => {
                    console.log('Received', data)
                    let json
                    try {
                        json = JSON.parse(data)
                    } catch(err) {
                        console.log(err)
                        this.conn.close()
                    }
                    console.log(json)
                    switch(json.type) {
                        // 握手
                        case 'handshake':
                            this.peerInfo = json.detail.device
                            break
                        
                        // 心跳
                        case 'ping':
                            this.lastHeartbeat = Date.now()
                            this.send('pong')
                            break
                        
                        case 'pong':
                            this.lastHeartbeat = Date.now()
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
                            console.log('Received', json)
                    }
                })

                // 发起握手
                this.send('handshake',{
                    device: {
                        type: DeviceInfo.getDeviceType(), 
                        name: DeviceInfo.getDeviceName(),
                        // 如果isPad为true，还要加一个07future字段
                        ...(isPad() ? {
                            '07future': {
                                stuId: getStuId(),
                                stuName: getStuName(),
                                stuClass: getStuClass(),
                            }
                        } : {})
                    }, 
                })

                // 发起首次心跳
                this.heartbeat()

                // 初始化文件传输
                this.fileTransfer = new FileTransfer({
                    role: this.role, 
                    peer: this.peer, 
                    mainConn: this.conn, 
                })
            })

            // 监听连接关闭
            this.conn.on('close', () => {
                console.log('Connection closed')
                this.conn = null
                this.peerInfo = null
                this.lastHeartbeat = -1
                if(this.role == Role.CONNECTOR) {
                    message.error('连接已断开')
                    this.goHome()
                }
            })
        }
    }
    
    heartbeat() {
        // 心跳
        if(!this.conn) {
            // 没有连接，不发送心跳
            return
        }
        if(this.lastHeartbeat != -1 && Date.now() - this.lastHeartbeat > 15000) {
            // 15秒未收到心跳，断开连接
            message.error('咦，好像断开连接了')
            if(this.conn) this.conn.close()
        }
        this.send('ping')
        setTimeout(() => this.heartbeat(), 5000)
    }

    tryReconnect() {
        let retryCount = 0
        let retryInterval = setInterval(() => {
            if(!this.peer.disconnected) {
                console.log('reconnected')
                clearInterval(retryInterval)
                return
            }
            if(retryCount >= 5) {
                console.log('reconnect failed')
                clearInterval(retryInterval)
                return
            }
            retryCount++
            console.log('reconnecting...')
            this.peer.reconnect()
        }, 2000)
    }

    handlePeerJSError(err) {
        console.log(err.type, err)

        switch(err.type) {
            case PeerJSError.PeerErrorType.Network:
                this.tryReconnect()
                break
        }
    }
}