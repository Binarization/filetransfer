<template>
    <div>
        <FileExcelOutlined v-if="file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'" />
        <FileWordOutlined v-else-if="file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'" />
        <FilePptOutlined v-else-if="file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'" />
        <FilePdfOutlined v-else-if="file.type === 'application/pdf'" />
        <FileTextOutlined v-else-if="file.type === 'text/plain'" />
        <FileMarkdownOutlined v-else-if="file.type === 'text/markdown'" />
        <FileZipOutlined v-else-if="file.type === 'application/zip'" />
        <FileOutlined v-else-if="!file.type.startsWith('image/')" />
    </div>
</template>
  
<script>
import {
    FileExcelOutlined,
    FileWordOutlined,
    FilePptOutlined,
    FilePdfOutlined,
    FileTextOutlined,
    FileMarkdownOutlined,
    FileZipOutlined,
    FileOutlined,
} from '@ant-design/icons-vue'

export default {
    components: {
        FileExcelOutlined,
        FileWordOutlined,
        FilePptOutlined,
        FilePdfOutlined,
        FileTextOutlined,
        FileMarkdownOutlined,
        FileZipOutlined,
        FileOutlined,
    },
    props: {
        file: {
            required: true,
        },
    },
    watch: {
        file: {
            immediate: true,
            handler() {
                console.log(this.file)
            },
        },
    }
}
</script>