// pages/mall/mall.js
Page({
  data: {
    products: [
      { id: 'p1', name: '极简吸顶灯 40cm', price: 399, image: 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg' },
      { id: 'p2', name: '观月组合 5+6', price: 1820, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
      { id: 'p3', name: '轨道射灯 12W', price: 129, image: 'https://images.pexels.com/photos/269218/pexels-photo-269218.jpeg' },
      { id: 'p4', name: '磁吸灯套装', price: 899, image: 'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg' },
      { id: 'p5', name: '智能筒灯 10W', price: 89, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
      { id: 'p6', name: '线型吊灯 1.2m', price: 599, image: 'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg' },
      { id: 'p7', name: '床头壁灯', price: 219, image: 'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg' },
      { id: 'p8', name: '庭院草坪灯', price: 159, image: 'https://images.pexels.com/photos/462235/pexels-photo-462235.jpeg' },
      { id: 'p9', name: '落地阅读灯', price: 329, image: 'https://images.pexels.com/photos/1248583/pexels-photo-1248583.jpeg' },
      { id: 'p10', name: '氛围灯带 5m', price: 199, image: 'https://images.pexels.com/photos/7130537/pexels-photo-7130537.jpeg' },
      { id: 'p11', name: '厨房橱柜灯', price: 149, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
      { id: 'p12', name: '镜前灯 9W', price: 189, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' }
    ]
  },

  onLoad() {},

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/mall/product-detail/product-detail?id=${id}` })
  }
})








