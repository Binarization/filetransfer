export const allowUpload = () => {
    return !isPad()
}

export const allowReceive = () => {
    return !isPad()
}

export const isPad = () => {
    return window.androidCallback && window.androidCallback.onStudentNameGet && window.androidCallback.onImageClick
}

export const getStuClass = () => {
    return window.androidCallback ? window.androidCallback.onStudentNameGet().split('|')[0] : null
}

export const getStuName = () => {
    return window.androidCallback ? window.androidCallback.onStudentNameGet().split('|')[1] : null
}

export const getStuId = () => {
    return window.androidCallback ? window.androidCallback.onStudentNameGet().split('|')[2] : null
}