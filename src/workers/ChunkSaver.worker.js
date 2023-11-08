import localForage from 'localforage'

let chunkId = null
let chunk = null

console.log('ChunkSaver worker loaded')

addEventListener('message', e => {
    if (typeof(e.data) == 'string') {
        chunkId = e.data
    } else {
        chunk = e.data
    }
    if (chunkId && chunk) {
        saveChunk(chunk)
    }
})

function saveChunk(chunk) {
    localForage.setItem(chunkId, chunk).then(() => {
        postMessage('success')
    }).catch(err => {
        console.error('worker: save error: ', err)
        postMessage('error')
    })
}