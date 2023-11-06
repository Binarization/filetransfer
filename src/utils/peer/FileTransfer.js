import { Role } from "./Enums"

export class FileTransfer {
    constructor({
        role = '', 
        peer = null, 
        mainConn = null, 
        subConns = [], 
        numOfSubConn = 8, 
    } = {}){
        this.chunkSize = 10 * 1024 * 1024 // 10MB
        this.role = role
        this.peer = peer
        this.mainConn = mainConn
        this.subConns = subConns

        if(role === Role.CONNECTOR) {
            this.createSubconn(numOfSubConn)
        }
    }

    appendSubconn(conn) {
        console.log('subconn added: ', conn)
        this.subConns.push(conn)
    }

    createSubconn(num){
        for(let i = 0; i < num; i++) {
            this.handleConnection(this.peer.connect(this.mainConn.peer, { reliable: true }))
        }
    }

    handleConnection(conn) {
        conn.on('open', () => {
            this.appendSubconn(conn)
        })
    }
}