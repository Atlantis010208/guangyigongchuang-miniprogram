const COPY = Object.freeze({
  profileAria: '\u8fdb\u5165\u6211\u7684\u9875\u9762',
  title: '\u9009\u62e9\u9002\u5408\u4f60\u7684\u706f\u5149\u670d\u52a1',
  subtitle: '\u4ece\u9700\u6c42\u6c9f\u901a\u5230\u4e13\u4e1a\u8bbe\u8ba1\uff0c\u627e\u5230\u9002\u5408\u4f60\u7684\u670d\u52a1\u65b9\u5f0f\u3002',
  collectionLabel: '\u9700\u6c42\u6536\u96c6\u8868',
  collectionTitle: '\u5148\u4ece\u4e86\u89e3\u4f60\u7684\u751f\u6d3b\u5f00\u59cb',
  collectionDescription: '\u9009\u62e9\u9002\u5408\u4f60\u7684\u6536\u96c6\u8868\u7c7b\u578b\uff0c\u8865\u5145\u7a7a\u95f4\u3001\u4e60\u60ef\u4e0e\u706f\u5149\u504f\u597d',
  collectionTypes: '4\u7c7b\u53ef\u9009',
  draftSupport: '\u652f\u6301\u4fdd\u5b58\u8349\u7a3f',
  collectionAction: '\u9009\u62e9\u6536\u96c6\u8868',
  mallLabel: '\u4e13\u4e1a\u5546\u57ce',
  mallTitle: '\u4e13\u4e1a\u5185\u5bb9\uff0c\u6309\u9700\u83b7\u53d6',
  mallDescription: '\u8bbe\u8ba1\u670d\u52a1 \u00b7 \u7cbe\u54c1\u8bfe\u7a0b \u00b7 \u5b9e\u7528\u5de5\u5177\u5305',
  mallAction: '\u8fdb\u5165\u5546\u57ce',
  mallCourseLabel: '\u706f\u5149\u8bbe\u8ba1\u601d\u7ef4\u4e0e\u5b9e\u8df5',
  professionalTitle: '\u4e13\u4e1a\u670d\u52a1',
  designTitle: '\u706f\u5149\u8bbe\u8ba1\u670d\u52a1',
  designSubtitle: '\u4ece\u9700\u6c42\u5206\u6790\u5230\u5b8c\u6574\u65b9\u6848',
  designAction: '\u4e86\u89e3\u670d\u52a1',
  consultTitle: '\u4e00\u5bf9\u4e00\u706f\u5149\u54a8\u8be2',
  consultSubtitle: '\u9488\u5bf9\u5177\u4f53\u95ee\u9898\u83b7\u5f97\u5efa\u8bae',
  consultAction: '\u9884\u7ea6\u54a8\u8be2',
  processTitle: '\u8bbe\u8ba1\u670d\u52a1\u6d41\u7a0b',
  continueLead: '\u5df2\u6709\u586b\u5199\u8bb0\u5f55\uff1f',
  continueAction: '\u7ee7\u7eed\u586b\u5199',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const PROCESS_STEPS = Object.freeze([
  {
    number: '01',
    title: '\u4e86\u89e3\u670d\u52a1',
    description: '\u9009\u62e9\u9002\u5408\u7684\u670d\u52a1\u65b9\u5f0f',
  },
  {
    number: '02',
    title: '\u786e\u8ba4\u5408\u4f5c',
    description: '\u6c9f\u901a\u76ee\u6807\u4e0e\u670d\u52a1\u8303\u56f4',
  },
  {
    number: '03',
    title: '\u83b7\u5f97\u65b9\u6848',
    description: '\u67e5\u770b\u4e13\u5c5e\u8bbe\u8ba1\u6210\u679c',
  },
])

function calculateLayout(windowInfo, menuButton) {
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  const menuTop = Number(menuButton.top) || statusBarHeight + 6
  const menuHeight = Number(menuButton.height) || 32

  return {
    statusBarHeight,
    navigationBarHeight: Math.max(
      44,
      (menuTop - statusBarHeight) * 2 + menuHeight
    ),
  }
}

function getLayout() {
  let windowInfo = {}
  let menuButton = {}

  try {
    windowInfo = wx.getWindowInfo
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
  } catch (error) {
    windowInfo = {}
  }

  try {
    menuButton = wx.getMenuButtonBoundingClientRect()
  } catch (error) {
    menuButton = {}
  }

  return calculateLayout(windowInfo, menuButton)
}

function openPage(url) {
  wx.navigateTo({
    url,
    fail() {
      wx.showToast({
        title: COPY.routeError,
        icon: 'none',
      })
    },
  })
}

Component({
  data: {
    copy: COPY,
    processSteps: PROCESS_STEPS,
    statusBarHeight: 20,
    navigationBarHeight: 44,
  },

  lifetimes: {
    attached() {
      this.setData(getLayout())
    },
  },

  pageLifetimes: {
    resize() {
      this.setData(getLayout())
    },
  },

  methods: {
    openCollection() {
      openPage('/pages/flows/collection-type/collection-type')
    },

    openDesignService() {
      openPage('/pages/lighting-manual/index')
    },

    openConsultation() {
      openPage('/pages/support/contact/contact')
    },

    openMall() {
      wx.switchTab({
        url: '/pages/mall/mall',
        fail() {
          wx.showToast({
            title: COPY.routeError,
            icon: 'none',
          })
        },
      })
    },

    goProfile() {
      openPage('/pages/profile/home/home')
    },
  },
})
