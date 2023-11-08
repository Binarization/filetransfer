<template>
    <div class="transfer-container">
        <div class="sidebar-container">
            <a-button class="home-button" type="primary" @click="goHome">
                <template #icon>
                    <DisconnectOutlined />
                </template>
                {{ mainConnection.role == Role.INITIATOR ? '关闭会话' : '断开连接' }}
            </a-button>
            <div v-if="mainConnection.role == Role.INITIATOR" class="container">
                <span class="container-title">加入链接</span>
                <div class="qr-container">
                    <a-qrcode :value="getQRCodeLink" :status="isQRCodeLoading" />
                    <a-input-group class="peer-id-lable">
                        <a-input :value="genLink" :readonly="true" />
                        <a-tooltip title="复制会话链接">
                            <a-button @click="copyPeerId">
                                <template #icon>
                                    <CopyOutlined />
                                </template>
                            </a-button>
                        </a-tooltip>
                    </a-input-group>
                </div>
            </div>
            <div class="container">
                <span class="container-title">当前连接</span>
                <div v-if="mainConnection.peerInfo === null" class="placeholder">暂无连接</div>
                <div v-else class="peer-info-container">
                    <div v-if="mainConnection.role == Role.INITIATOR" class="disconnect-container" @click="mainConnection.close()">
                        <DisconnectOutlined />
                        断开当前连接
                    </div>
                    <div class="icon">
                        <IconFont v-if="mainConnection.peerInfo.type == 'pc'" type="icon-pc" />
                        <IconFont v-else-if="mainConnection.peerInfo.type == 'mobile'" type="icon-phone" />
                        <IconFont v-else-if="mainConnection.peerInfo.type == 'tablet'" type="icon-tablet" />
                        <IconFont v-else type="icon-unknown_device" />
                    </div>
                    <div class="name">
                        {{ mainConnection.peerInfo.name[0] }}的&zwnj;{{ mainConnection.peerInfo.name[1] }}
                    </div>
                </div>
            </div>
        </div>
        <div class="content-container">
            <a-spin :spinning="connecting" tip="正在建立连接...">
                <div class="container">
                    <span class="container-title">发送文件</span>
                    <div v-if="mainConnection.peerInfo === null" class="placeholder">等待加入会话</div>
                    <a-upload-dragger v-else name="file" list-type="picture-card" :multiple="true" :disabled="!allowUpload"
                        :customRequest="handleUpload" :fileList="fileList.send" @change="handleChange" @preview="handlePreview">
                        <p v-if="allowUpload" class="ant-upload-drag-icon">
                            <inbox-outlined></inbox-outlined>
                        </p>
                        <p class="ant-upload-text">{{ allowUpload ? "点击或拖拽文件到此区域发送" : "由于校方管控，不支持发送文件" }}</p>
                        <p class="ant-upload-hint">

                        </p>
                        <template v-slot:iconRender="{file}">
                            <div v-if="file.status === 'uploading'">发送中</div>
                            <div v-else-if="file.status === 'done'">
                                <FileIcon :file="file" />
                            </div>
                        </template>
                    </a-upload-dragger>
                </div>
                <div class="container receive">
                    <span class="container-title">接收文件</span>
                    <div v-if="fileList.receive.length == 0" class="placeholder">暂无文件</div>
                    <a-upload-dragger v-else list-type="picture-card" :multiple="true" :disabled="!allowReceive"
                        :fileList="fileList.receive" @preview="handlePreview">
                        <template v-slot:iconRender="{file}">
                            <div v-if="file.status === 'uploading'">接收中</div>
                            <div v-else-if="file.status === 'done'">
                                <FileIcon :file="file" />
                            </div>
                        </template>
                    </a-upload-dragger>
                </div>
            </a-spin>
        </div>
        <!-- 图片预览 -->
        <a-image :style="{ display: 'none' }" :preview="{
            visible: previewVisible,
            onVisibleChange: setPreviewVisible,
        }" :src="previewSrc" />
    </div>
</template>

<script>
import { CopyOutlined, DisconnectOutlined, InboxOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { allowUpload, allowReceive, isPad } from '@/utils/07future'
import { MainConnection } from '@/utils/peer/MainConnection'
import { Role } from '@/utils/peer/Enums'
import PeerJSError from '@/utils/peer/PeerJSError'
import FileIcon from '@/components/FileIcon.vue'

export default {
    components: {
        CopyOutlined,
        DisconnectOutlined,
        InboxOutlined,
        FileIcon,
    },
    data() {
        return {
            mainConnection: null,
            previewVisible: false,
            previewSrc: '',
            Role: Role,
            fileList: {
                send: [],
                receive: [],
            },
            connecting: false,
        }
    },
    computed: {
        allowUpload() {
            return allowUpload()
        },
        allowReceive() {
            return allowReceive()
        },
        genLink() {
            // 生成会话链接
            return `${window.location.origin}/#/transfer/${this.mainConnection.peerId}`
        },
        getQRCodeLink() {
            // 生成二维码链接
            return this.genLink
        },
        isQRCodeLoading() {
            return this.mainConnection.peerId === '' ? 'loading' : 'active'
        },
    },
    created() {
        this.mainConnection = new MainConnection(this.fileList, this.updateConnecting, this.updateFileListRecv)
    },
    mounted() {
        // 关闭先前未关闭会话
        if(this.mainConnection.conn) {
            this.mainConnection.close()
        }
        this.mainConnection.setGoHomeHandler(this.handleGoHome)
        this.mainConnection.init(this.$route.params.id)
        this.mainConnection.addPeerJSErrorListenner(this.handlePeerJSError)
    },
    unmounted() {
        if(this.mainConnection) {
            this.mainConnection.destroy()
        }
    },
    methods: {
        copyPeerId() {
            // 复制会话连接
            navigator.clipboard.writeText(this.getQRCodeLink)
        },
        goHome() {
            // 关闭会话
            this.mainConnection.destroy()
            this.$router.push('/')
        },
        handleGoHome() {
            this.$router.push('/')
        },
        updateConnecting(value) {
            this.$nextTick(() => {
                this.connecting = value
            })
        },
        updateFileListRecv({uid, status, percent, file, thumbUrl} = {}) {
            this.$nextTick(() => {
                // 更新fileList.receive里的对应文件status和percent
                const item = this.fileList.receive.find(file => file.uid === uid)
                if(item) {
                    if(status) item.status = status
                    if(percent) item.percent = percent
                    if(file) item.originFileObj = file
                    if(thumbUrl) item.thumbUrl = thumbUrl
                }
            })
        },
        handlePeerJSError(err) {
            if(PeerJSError.getPeerJSErrorMsg(err)) {
                switch(err.type) {
                    case PeerJSError.PeerErrorType.BrowserIncompatible:
                        this.$router.replace({
                            name: 'warning',
                            params: {
                                title: '不支持的浏览器',
                                msg: PeerJSError.getPeerJSErrorMsg(err)
                            }
                        })
                        break
                    
                    case PeerJSError.PeerErrorType.PeerUnavailable:
                        this.$router.replace({
                            name: 'warning',
                            params: {
                                title: '连接失败',
                                msg: PeerJSError.getPeerJSErrorMsg(err)
                            }
                        })
                        break

                    default:
                        message.error(PeerJSError.getPeerJSErrorMsg(err))
                }
            } else {
                message.error(`PeerJSError: ${err.message}`)
            }
        },
        handlePreview(file) {
            console.log(file)
            if (isPad()) {
                window.androidCallback.onImageClick(file.thumbUrl)
            } else {
                this.previewSrc = file.thumbUrl
                this.setPreviewVisible(true)
            }
        },
        setPreviewVisible(value) {
            this.previewVisible = value
        },
        handleChange(info) {
            const status = info.file.status
            const fileList = info.fileList
            if (status === 'done') {
                message.success(`${info.file.name}发送成功`);
            } else if (status === 'error') {
                message.error(`${info.file.name}发送失败`);
            }
            this.fileList.send = [...fileList]
        },
        handleUpload({ file, onSuccess, onError, onProgress }) {
            this.mainConnection.fileTransfer.presend(file, onSuccess, onError, onProgress)
        }, 
    },
}
</script>

<style scoped>
.transfer-container {
    width: 100%;
    max-width: 960px;
    height: 90vh;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10vh;
    margin: auto;
}

.home-button {
    width: 100%;
    height: fit-content;
    font-size: 17px;
    padding: 5px 0px;
    border-radius: 13px;
}

.transfer-container .container {
    width: 100%;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 13px;
    padding: 13px;
}

.container-title {
    width: 100%;
    color: rgb(22 119 255);
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 9px !important;
    padding-left: 7px;
}

.sidebar-container {
    width: 25vw;
    height: fit-content;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin-right: 20px;
}

.sidebar-container>*:not(:last-child), .content-container>*>*>*:not(:last-child) {
    margin-bottom: 13px;
}

.qr-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.ant-qrcode {
    margin-bottom: 13px;
}

.peer-id-lable {
    display: flex;
    flex-direction: row;
}

.peer-id-lable>button {
    border-left-width: 0px;
    border-start-start-radius: 0;
    border-end-start-radius: 0;
}

.peer-info-container {
    position: relative;
    width: 100%;
    height: 66px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid #1677ff;
    border-radius: 8px;
    transition: border-color 0.3s;
    /* 内部文字 */
    display: flex;
    justify-content: center;
    align-items: center;
    color: rgba(0, 0, 0, 0.88);
    font-size: 16px;

    .disconnect-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        position: absolute;
        color: #FFFFFF;
        font-size: 17px;
        background: rgb(22 119 255 / 95%);
        border-radius: 7px;
        cursor: pointer;
        opacity: 0;
        transition: all 0.3s;
        
        .anticon {
            margin-right: 5px;
        }
    }

    .disconnect-container:hover {
        opacity: 1;
    }

    .icon {
        color: rgb(0, 153, 255);
        font-size: 27px;
    }

    .name {
        width: min-content;
        word-break: keep-all;
        padding-left: 0.6em;
    }
}

.content-container {
    width: 60vw;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.content-container>* {
    width: 100%;
    max-height: 65vh;
}

:global(.content-container .container.receive .ant-upload) {
    display: none;
}

:global(.ant-upload-wrapper) {
    display: contents;
}

:global(.ant-upload-list) {
    margin: 7px 0;
    overflow: auto;
}

.placeholder {
    position: relative;
    width: 100%;
    height: 66px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed #d9d9d9;
    border-radius: 8px;
    transition: border-color 0.3s;
    /* 内部文字 */
    display: flex;
    justify-content: center;
    align-items: center;
    color: rgba(0, 0, 0, 0.88);
    font-size: 16px;
}

@media screen and (max-width: 768px) {
    .transfer-container {
        height: fit-content;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding-top: 5vh;
    }

    .sidebar-container,
    .content-container {
        width: 85vw;
        margin-right: 0;
        margin-bottom: 20px;
    }

    .sidebar-container>*:not(:last-child), .content-container>*:not(:last-child) {
        margin-bottom: 20px;
    }

    .qr-container{
        flex-direction: row;
    }

    .peer-id-lable {
        width: 30vw;
        margin-left: 13px;
    }
}
</style>