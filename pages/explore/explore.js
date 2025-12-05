// pages/explore/explore.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    videoPlaying: false,
    videoSrc: 'https://www.tiktok.com/@infamous_wu13/video/7537213379413363982?is_from_webapp=1&sender_device=pc&web_id=7539457568726779400',
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  // 点击卡片：切换到播放态
  onVideoTap() {
    if (this.data.videoPlaying) return;
    this.setData({ videoPlaying: true }, () => {
      const ctx = wx.createVideoContext('shortVideo', this);
      ctx.play();
    });
  },

  // 播放结束：恢复封面
  onVideoEnded() {
    this.setData({ videoPlaying: false });
  },

  onBrowseCoursesTap(){
    wx.navigateTo({ url: '/pages/explore/courses/courses' })
  },
  onNearbyActivitiesTap(){
    // 标题点击：跳转到“浏览即将举办的课程”
    wx.navigateTo({ url: '/pages/explore/courses/courses' })
  },
  onActivityTap(e){
    // 卡片点击：进入活动详情（迁移到新分包）
    const id = e.currentTarget.dataset.activity || 'video'
    wx.navigateTo({ url: `/pages/activities/detail/detail?id=${id}` })
  },

  // 个人中心：与产品页一致
  onUserTap() {
    wx.navigateTo({ url: '/pages/profile/home/home' })
  }
})