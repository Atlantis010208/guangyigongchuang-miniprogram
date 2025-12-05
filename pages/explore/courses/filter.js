Page({
  data: {
    form: { online: false, store: false },
    type: { guest: false, walk: false, workshop: false },
    time: { am: false, pm: false, eve: false },
    topics: [
      { key: 'storefront', name: 'Apple Store 零售店最现场', on: false },
      { key: 'daily', name: '日常课程', on: false },
      { key: 'family', name: '亲子', on: false },
      { key: 'assist', name: '辅助功能', on: false },
      { key: 'iphone', name: 'iPhone', on: false },
      { key: 'ipad', name: 'iPad', on: false },
      { key: 'mac', name: 'Mac', on: false },
      { key: 'watch', name: 'Apple Watch', on: false },
      { key: 'art', name: '艺术与设计', on: false },
      { key: 'biz', name: '商务', on: false },
      { key: 'coding', name: '编程与 App', on: false },
      { key: 'music', name: '音乐', on: false },
      { key: 'photo', name: '摄影', on: false },
      { key: 'product', name: '产品', on: false },
      { key: 'video', name: '视频', on: false },
      { key: 'edu', name: '教育', on: false }
    ],
    hasSelection: false
  },

  onLoad() {
    this.channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
  },

  updateHasSelection() {
    const { form, type, time, topics } = this.data;
    const selected = (
      form.online || form.store ||
      type.guest || type.walk || type.workshop ||
      time.am || time.pm || time.eve ||
      topics.some(t => t.on)
    );
    this.setData({ hasSelection: selected });
  },

  toggle(e) {
    const { cat, key } = e.currentTarget.dataset;
    const obj = { ...this.data[cat] };
    obj[key] = !obj[key];
    this.setData({ [cat]: obj }, () => this.updateHasSelection());
  },

  toggleTopic(e) {
    const { index } = e.currentTarget.dataset;
    const list = this.data.topics.slice();
    list[index].on = !list[index].on;
    this.setData({ topics: list }, () => this.updateHasSelection());
  },

  onReset() {
    const clearedTopics = this.data.topics.map(t => ({ ...t, on: false }));
    this.setData({
      form: { online: false, store: false },
      type: { guest: false, walk: false, workshop: false },
      time: { am: false, pm: false, eve: false },
      topics: clearedTopics,
      hasSelection: false
    });
  },

  onSearch() {
    const payload = {
      form: this.data.form,
      type: this.data.type,
      time: this.data.time,
      topics: this.data.topics.filter(t => t.on).map(t => t.key)
    };
    this.channel && this.channel.emit && this.channel.emit('filtersApplied', payload);
    wx.navigateBack();
  }
});

