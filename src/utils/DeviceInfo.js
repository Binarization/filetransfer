import { UAParser } from 'ua-parser-js'
import { getStuName, isPad } from './07future'

export const getDeviceName = () => {
    if(isPad()) {
        return `${getStuName()}的领启平板`
    } else {
        return `${getDeviceType()}的${getBrowserName()}`
    }
}

export const getDeviceType = () => {
    const parser = new UAParser()
    const result = parser.getResult()
    return (osNameDict[result.os.name] || result.os.name) + (deviceTypeDict[result.device.type] || '')
}

export const getBrowserName = () => {
    const parser = new UAParser()
    const result = parser.getResult()
    return (browserNameDict[result.browser.name] || result.browser.name) + '浏览器'
}

export default {
    getDeviceName
}

const browserNameDict = {
    '360 Browser': '360',
    'Android Browser': '安卓',
    'Samsung Browser': '三星',
    'baidubrowser': '百度',
    'Huawei Browser': '华为',
    'Maxthon': '遨游',
    'MIUI Browser': '小米',
    'Mobile Safari': 'Safari',
    'QQBrowser': 'QQ',
    'UCBrowser': 'UC',
    'WeChat': '微信',
    'weibo': '微博',
    'Mobile Firefox': '火狐',
    'Firefox': '火狐',
    'QQ': 'QQ',
    'baiduboxapp': '百度APP',
    'WeChat(Win) Desktop': '微信电脑版',
    'MetaSr': '搜狗',
    'LBBROWSER': '猎豹',
    'BIDUBrowser': '百度',
    '2345Explorer': '2345',
    'QQBrowserLite': 'QQ',
    'Mobile Chrome': 'Chrome',
    'Baidu': '百度',
    'BaiduHD': '百度',
    'Firefox Focus': '火狐',
    'Firefox Reality': '火狐',
    'Weibo': '微博',
    'baidu': '百度',
}

const osNameDict = {
    'BlackBerry': '黑莓',
    'HarmonyOS': '鸿蒙',
}

const deviceTypeDict = {
    'mobile': '手机',
    'tablet': '平板',
    'smarttv': '电视',
    'wearable': '可穿戴设备',
    'console': '游戏机',
    'embedded': '嵌入式设备',
}