console.log('FileReader worker loaded')

addEventListener('message', e => {
    // console.log('worker received: ', e.data)
    // 使用FileReader读取文件
    let reader = new FileReader()
    reader.readAsArrayBuffer(e.data)
    reader.onload = () => {
        postMessage(reader.result)
        reader = null
    }
    reader.onerror = (err) => {
        console.error('worker: read error: ', err)
        postMessage('error')
    }
})