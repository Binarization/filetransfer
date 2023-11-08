console.log('FileReader worker loaded')
const reader = new FileReader()

addEventListener('message', e => {
    // console.log('worker received: ', e.data)
    // 使用FileReader读取文件
    reader.onload = () => {
        postMessage(reader.result)
    }
    reader.readAsArrayBuffer(e.data)
    reader.onerror = (err) => {
        console.error('worker: read error: ', err)
        postMessage('error')
    }
})