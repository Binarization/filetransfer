export const allowUpload = () => {
    return !isPad()
}

export const allowReceive = () => {
    return !isPad()
}

function isPad() {
    return window.androidCallback && window.androidCallback.onStudentNameGet && window.androidCallback.onImageClick
}