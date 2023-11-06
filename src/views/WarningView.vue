<template>
    <a-result status="warning">
        <template #title>
            <div v-html="$route.params.title"></div>
        </template>
        <template #subTitle>
            <div v-html="$route.params.msg"></div>
        </template>
        <template #extra>
            <a-button type="primary" @click="$router.replace('/')">返回主页</a-button>
        </template>
    </a-result>
</template>

<style scoped>
.ant-result {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
</style>