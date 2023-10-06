import DeviceInfo from '@/utils/DeviceInfo'

export const getPeerJSErrorMsg = (error) => {
	switch(error.type) {
		case PeerErrorType.BrowserIncompatible:
			return `哎呀，当前浏览器暂不支持使用Direct Transfer，请${DeviceInfo.isMobile() ? '尝试更换使用<a href="https://google.cn/chrome/">Chrome浏览器</a>或微信访问' : '尝试更换使用<a href="https://google.cn/chrome/">Chrome浏览器</a>访问'}}`

		case PeerErrorType.Disconnected:
			return '连接断开了(っ °Д °;)っ'
		
		case PeerErrorType.InvalidID:
			return '无效的会话ID w(ﾟДﾟ)w'
		
		case PeerErrorType.InvalidKey:
			return '无效的Key'
		
		case PeerErrorType.Network:
			return '网络错误 (╯°口°)╯'
		
		case PeerErrorType.PeerUnavailable:
			return '无效的Peer `(*>﹏<*)′'
		
		case PeerErrorType.SslUnavailable:
			return 'SSL不可用 `(*>﹏<*)′'
		
		case PeerErrorType.ServerError:
			return '服务器错误 `(*>﹏<*)′'
		
		case PeerErrorType.SocketError:
			return 'Socket错误 `(*>﹏<*)′'
		
		case PeerErrorType.SocketClosed:
			return 'Socket已关闭 `(*>﹏<*)′'
		
		case PeerErrorType.UnavailableID:
			return '不可用的会话ID w(ﾟДﾟ)w'
		
		case PeerErrorType.WebRTC:
			return 'WebRTC错误 `(*>﹏<*)′'
		
		default:
			return null
	}
}

export const PeerErrorType = {
    /**
     * The client's browser does not support some or all WebRTC features that you are trying to use.
     */
    BrowserIncompatible: "browser-incompatible",
    /**
     * You've already disconnected this peer from the server and can no longer make any new connections on it.
     */
    Disconnected: "disconnected",
    /**
     * The ID passed into the Peer constructor contains illegal characters.
     */
    InvalidID: "invalid-id",
    /**
     * The API key passed into the Peer constructor contains illegal characters or is not in the system (cloud server only).
     */
    InvalidKey: "invalid-key",
    /**
     * Lost or cannot establish a connection to the signalling server.
     */
    Network: "network",
    /**
     * The peer you're trying to connect to does not exist.
     */
    PeerUnavailable: "peer-unavailable",
    /**
     * PeerJS is being used securely, but the cloud server does not support SSL. Use a custom PeerServer.
     */
    SslUnavailable: "ssl-unavailable",
    /**
     * Unable to reach the server.
     */
    ServerError: "server-error",
    /**
     * An error from the underlying socket.
     */
    SocketError: "socket-error",
    /**
     * The underlying socket closed unexpectedly.
     */
    SocketClosed: "socket-closed",
    /**
     * The ID passed into the Peer constructor is already taken.
     *
     * :::caution
     * This error is not fatal if your peer has open peer-to-peer connections.
     * This can happen if you attempt to {@apilink Peer.reconnect} a peer that has been disconnected from the server,
     * but its old ID has now been taken.
     * :::
     */
    UnavailableID: "unavailable-id",
    /**
     * Native WebRTC errors.
     */
    WebRTC: "webrtc",
}

export default {
    getPeerJSErrorMsg,
    PeerErrorType,
}