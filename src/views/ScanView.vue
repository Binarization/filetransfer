<template>
    <div class="camera-container">
        <a-float-button type="primary" @click="goHome" :style="{
            top: '32px',
            left: '32px',
            transform: 'scale(1.2)',
        }">
            <template #icon>
                <LeftOutlined />
            </template>
        </a-float-button>
        <a-spin :spinning="cameraLoading">
            <div class="camera-wrapper">
                <div v-if="!cameraLoading" class="animation"></div>
                <qrcode-stream :paused="cameraReload" :constraints="constraints" @camera-on="onCameraOn" @detect="onDetect"
                    @error="onCameraError"></qrcode-stream>
            </div>
        </a-spin>
        <a-select v-model:value="selectedDeviceId" style="width: 200px" @change="switchCamera">
            <a-select-option v-for="(device, index) in devices" :key="index" :value="device.deviceId">
                {{ device.label ? device.label : `摄像头 ${index + 1}` }}
            </a-select-option>
        </a-select>
    </div>
</template>

<script>
import { message, Select } from 'ant-design-vue'
import { LeftOutlined } from '@ant-design/icons-vue'
import { QrcodeStream } from 'vue-qrcode-reader'

export default {
    components: {
        ASelect: Select,
        ASelectOption: Select.Option,
        LeftOutlined,
        QrcodeStream,
    },
    data() {
        return {
            constraints: null,
            devices: [],
            selectedDeviceId: null,
            cameraLoading: true,
            cameraReload: false,
        }
    },
    mounted() {
        this.initCamera()
    },
    methods: {
        goHome() {
            this.$router.push('/')
        },
        async initCamera() {
            try {
                // 先请求摄像头权限
                await navigator.mediaDevices.getUserMedia({ video: true })
                const devices = await navigator.mediaDevices.enumerateDevices()
                this.devices = devices.filter(device => device.kind === 'videoinput')
                if (this.devices.length === 0) {
                    message.error('没有找到摄像头')
                    return
                }
                this.selectedDeviceId = this.devices[0].deviceId
                await this.switchCamera()
            } catch (error) {
                console.error(error)
                return
            }
        },
        async switchCamera() {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop())
            }
            this.cameraLoading = true
            this.cameraReload = true
            this.constraints = { deviceId: { exact: this.selectedDeviceId } }
            setTimeout(() => {
                this.cameraReload = false
            }, 1)
        },
        onCameraOn() {
            this.cameraLoading = false
        },
        onDetect(result) {
            console.log(result)
            for (let i = 0; i < result.length; i++) {
                let url = null
                try {
                    url = new URL(result[i].rawValue)
                } catch (error) {
                    console.log(error)
                }
                if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
                    // message.info(`扫描结果：${result[i].rawValue}`)
                    const match = result[i].rawValue.match(/\/transfer\/([0-9a-f-]{36})/)
                    if (match) {
                        this.$router.push(`/transfer/${match[1]}`)
                    }
                    return
                }
            }
        },
        onCameraError(error) {
            console.error(error)
            if (error.name === 'NotAllowedError') {
                message.error('请授权访问摄像头')
            } else if (error.name === 'NotFoundError') {
                message.error('没有找到摄像头')
            } else if (error.name === 'NotSupportedError') {
                message.error('浏览器不支持访问摄像头')
            } else if (error.name === 'NotReadableError') {
                message.error('摄像头被占用')
            } else if (error.name === 'OverconstrainedError') {
                message.error('设备不支持指定的参数')
            } else if (error.name === 'StreamApiNotSupportedError') {
                message.error('浏览器不支持访问Stream API')
            } else {
                message.error('开启摄像头失败，请确认是否已授权访问摄像头')
            }
        },
    }
}
</script>

<style>
.camera-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.camera-wrapper {
    position: relative;
    width: 300px;
    height: 300px;
    border: 5px solid #0099ff;
    border-radius: 50px;
    overflow: hidden;
    margin-bottom: 17px;
    filter: opacity(1);
    /* 调用显卡加速 */
}

.camera-wrapper .animation {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(0deg, rgba(255, 255, 255, 0) 47%, rgb(0 153 255 / 35%) 50%, rgba(255, 255, 255, 0) 53%);
    animation: scan 5s ease-in-out infinite;
    z-index: 999;
}

@keyframes scan {
    0% {
        transform: translateY(-55%);
    }

    50% {
        transform: translateY(55%);
    }

    100% {
        transform: translateY(-55%);
    }
}
</style>