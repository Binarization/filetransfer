<template>
    <div class="homepage">
        <div class="image-container">
            <img :src="logo" alt="Website Image" />
        </div>
        <h1 class="title">Direct Transfer</h1>
        <div class="buttons">
            <router-link to="/sender">
                <button class="send-button">我要发送文件</button>
            </router-link>
            <router-link to="/receiver">
                <button class="receive-button">我要接收文件</button>
            </router-link>
        </div>
        <div class="footer">
            <span>Powered by 一零次元</span>
        </div>
    </div>
</template>
  
<script>
import logo from '@/assets/logo.png';
import { message } from 'ant-design-vue';

export default {
    name: "HomePage",
    data() {
        return {
            logo: logo,
        };
    },
};
</script>
  
<style scoped>
.homepage {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    font-family: 'Open Sans', sans-serif;
    padding: 20px;
    user-select: none;
}

img {
    max-width: 100px;
    width: 70vw;
}

.title {
    font-size: 36px;
    font-weight: bold;
    color: #333;
}

.buttons {
    margin-top: 20px;
}

.send-button,
.receive-button {
    background-color: #0099ff;
    color: #fff;
    padding: 12px 24px;
    /* 增加按钮内边距 */
    border: none;
    border-radius: 5px;
    font-size: 18px;
    margin: 10px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    /* 添加过渡效果 */
}

.send-button:hover,
.receive-button:hover {
    background-color: #0056b3;
}

.footer {
    display: flex;
    flex-direction: row;
    justify-content: center;
    position: absolute;
    bottom: 21px;
    left: 0;
    right: 0;
}

.footer span {
    font-size: 17px;
    font-weight: bold;
}
</style>
