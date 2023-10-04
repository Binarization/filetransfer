export const allowUpload = () => {
    return !isPad()
}

export const allowReceive = () => {
    return !isPad()
}

export const isPad = () => {
    return window.androidCallback && window.androidCallback.onStudentNameGet && window.androidCallback.onImageClick
}