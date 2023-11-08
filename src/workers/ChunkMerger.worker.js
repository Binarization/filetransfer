import localForage from 'localforage'

console.log('ChunkMerger worker loaded')

addEventListener('message', e => {
    console.log('ChunkMerger uid: ', e.data)
    const { uid, name, type, numOfChunks } = e.data
    mergeChunks(uid, name, type, numOfChunks)
})

async function mergeChunks(uid, name, type, numOfChunks) {
    let chunks = []
    for(let i = 0; i < numOfChunks; i++) {
        chunks.push(await localForage.getItem(`${uid}-${i}`))
        localForage.removeItem(`${uid}-${i}`)
    }
    // 生成Blob
    let blob = new Blob(chunks, { type })
    // 生成File
    let file = new File([blob], name, { type })
    file.uid = uid
    postMessage(file)
}