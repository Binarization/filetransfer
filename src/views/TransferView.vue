<template>
    <div class="transfer-container">
        <div v-if="role == 'initiator'" class="container sidebar-container">
            <span class="container-title">加入会话</span>
            <div class="qr-container">
                <a-qrcode :value="getQRCodeLink" :status="isQRCodeLoading" />
                <a-input-group class="peer-id-lable">
                    <a-input v-model:value="peerId" />
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
        <div class="content-container">
            <div class="container">
                <span class="container-title">发送文件</span>
                <a-upload-dragger name="file" list-type="picture-card" :multiple="true" :disabled="!allowUpload"
                    :customRequest="handleUpload" @change="handleChange" @preview="handlePreview">
                    <p v-if="allowUpload" class="ant-upload-drag-icon">
                        <inbox-outlined></inbox-outlined>
                    </p>
                    <p class="ant-upload-text">{{ allowUpload ? "点击或拖拽文件到此区域上传" : "由于校方管控，不支持发送文件" }}</p>
                    <p class="ant-upload-hint">

                    </p>
                </a-upload-dragger>
            </div>
            <div class="container">
                <span class="container-title">接收文件</span>
                <div class="receive-placeholder">暂无文件</div>
                <a-upload>
                </a-upload>
            </div>
        </div>
        <!-- 图片预览 -->
        <a-image :style="{ display: 'none' }" :preview="{
            visible: previewVisible,
            onVisibleChange: setPreviewVisible,
        }" :src="previewSrc" />
    </div>
</template>

<script>
import { Peer } from 'peerjs'
import { CopyOutlined, InboxOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { allowUpload, allowReceive, isPad } from '@/utils/07future'

export default {
    components: {
        CopyOutlined,
        InboxOutlined,
    },
    data() {
        return {
            peer: new Peer({ debug: 2 }),
            peerId: '',
            role: 'initiator',
            conn: null,
            previewVisible: false,
            previewSrc: '',
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
            return `${window.location.origin}/#/transfer/${this.peerId}`
        },
        getQRCodeLink() {
            // 生成二维码链接
            return this.genLink
        },
        isQRCodeLoading() {
            return this.peerId === '' ? 'loading' : 'active'
        },
    },
    mounted() {
        // 判断路由是否传入id
        if (this.$route.params.id) {
            this.role = 'connector'

            // 加入现有会话
            this.peer.on('open', (id) => {
                this.peerId = id
                this.conn = this.peer.connect(this.$route.params.id, { reliable: true })
                this.handleConnection()
            });
        } else {
            this.role = 'initiator'

            // 创建新的会话
            this.peer.on('open', (id) => {
                this.peerId = id
            });

            // 监听连接
            this.peer.on('connection', (conn) => {
                this.conn = conn
                this.handleConnection()
            })
        }
    },
    methods: {
        copyPeerId() {
            // 复制会话连接
            navigator.clipboard.writeText(this.getQRCodeLink)
        },
        handleConnection() {
            // 处理连接
            this.conn.on('open', () => {
                // Receive messages
                this.conn.on('data', function (data) {
                    console.log('Received', data)
                    message.success('Received ' + data)
                })

                // Send messages
                this.conn.send('Hello!')
                message.success('连接成功')
            })
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
            this.previewVisible = value;
        },
        handleChange(info) {
            const status = info.file.status;
            if (status !== 'uploading') {
                console.log(info.file, info.fileList);
            }
            if (status === 'done') {
                message.success(`${info.file.name}发送成功`);
            } else if (status === 'error') {
                message.error(`${info.file.name}发送失败`);
            }
        },
        handleUpload({ file, onSuccess, onError, onProgress }) {
            console.log(file)
            let progress = 0;
            setInterval(() => {
                if (progress >= 100) return
                progress += 20
                onProgress({ percent: progress })
            }, 1000)
            setTimeout(() => {
                onSuccess('ok')
            }, 5000)
        },
    },
}
</script>

<style scoped>
.transfer-container {
    width: 100vw;
    height: 80vh;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
    padding-top: 20vh;
}

.transfer-container .container {
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
    margin-bottom: 9px!important;
    padding-left: 7px;
}

.sidebar-container {
    width: fit-content;
    height: fit-content;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin-right: 20px;
}

.sidebar-container>*:not(:last-child) {
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

.content-container {
    width: 60vw;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

.content-container > * {
    width: 100%;
}

.content-container>*:not(:last-child) {
    margin-bottom: 20px;
}

.receive-placeholder {
    position: relative;
    width: 100%;
    height: 66px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed #d9d9d9;
    border-radius: 8px;
    cursor: pointer;
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

    .sidebar-container {
        width: 85vw;
    }
}
</style>