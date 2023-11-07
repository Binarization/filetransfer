import { Peer } from 'peerjs'

let peer = null
let conn = null

addEventListener('message', e => {
    console.log('SubConnection.worker: ', e.data)
    const { type, detail } = e.data
    switch(type) {
        case 'init':
            console.log('SubConnection.worker: ', '初始化')
            peer = new Peer({ debug: 2 })
            console.log(peer)
            peer.on('open', (id) => {
                console.log('SubConnection.worker: ', 'Peer就绪: ', id)
                self.postMessage({
                    type: 'initFinish',
                    detail: {
                        peerId: id,
                    }
                })
            })
            break
        
        case 'connect':
            conn = peer.connect(detail.peerId, { reliable: true })
            conn.on('open', () => {
                console.log('SubConnection.worker: ', '连接已建立')
                postMessage({
                    type: 'connectFinish',
                    detail: null,
                })
            })
            break

        case 'send':
            
            break
        
        case 'destroy':
            peer.destroy()
            break

        default:
            console.error('SubConnection.worker: ', '未知的消息类型: ', type)
    }
})