<template>
    <div class="homepage">
        <div class="logo">
            <div class="image-container">
                <img :src="logo" alt="Website Image" />
            </div>
            <h1 class="title">Direct Transfer</h1>
        </div>
        <div class="buttons">
            <router-link to="/transfer">
                <a-button type="primary" size="large" class="send-button">
                    <IconFont type="icon-create" style="color: #fff" />
                    创建一个新会话
                </a-button>
            </router-link>
            <router-link to="/scan">
                <a-button size="large" class="receive-button">
                    <IconFont type="icon-scan_qr" style="color: #0099ff" />
                    加入现有会话
                </a-button>
            </router-link>
        </div>
        <div class="footer" :style="getFooterStyle">
            <span>Powered by</span>
            <StudioLogo style="height: 23px; margin-left: 7px;" />
        </div>
    </div>
</template>
  
<script>
import logo from '@/assets/logo.png'
import StudioLogo from '@/components/StudioLogo.vue'

export default {
    name: "HomePage",
    data() {
        return {
            logo: logo,
            windowHeight: 0,
        }
    },
    components: {
        StudioLogo,
    },
    computed: {
        getFooterStyle() {
            return {
                top: `${this.windowHeight - 17 * 2 - 3}px`, 
                height: '34px', 
            }
        },
    },
    mounted() {
        this.updateWindowHeight()
        window.addEventListener('resize', this.updateWindowHeight)
    },
    methods: {
        updateWindowHeight() {
            this.windowHeight = window.innerHeight
        },
    }
}
</script>
  
<style scoped>
.homepage {
    width: 75vw;
    max-width: 768px; 
    height: 100vh;
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    align-items: center;
    margin: auto;
}

@media screen and (max-width: 768px) {
    .homepage {
        flex-direction: column;
        height: 55vh;
        padding-top: 40vh;
    }
}

.logo {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

img {
    max-width: 100px;
    width: 70vw;
}

.title {
    text-align: center;
    font-size: 36px;
    font-weight: bold;
    color: #333;
}

.buttons {
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
    margin-top: 20px;
}

.buttons a:not(:last-child) {
    margin-bottom: 20px;
}

.send-button {
    height: fit-content;
    background-color: #0099ff;
    color: #fff;
    font-size: 21px;
    padding: 7px 17px;
}

.receive-button {
    height: fit-content;
    background-color: #fff;
    color: #0099ff;
    font-size: 21px;
    padding: 7px 17px;
}

.footer {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    position: absolute;
    left: 0;
    right: 0;
}

.footer span {
    font-size: 17px;
    font-weight: bold;
}
</style>
