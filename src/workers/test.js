addEventListener('message', e => {
    const { data } = e
    console.log(data)
    setTimeout(() => {
        return postMessage('线程完成')
    }, 1000)
})

console.log('线程启动')