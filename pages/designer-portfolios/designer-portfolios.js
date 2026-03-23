Page({
  data: {
    currentTab: '全部',
    portfolios: [], // 所有作品
    filteredPortfolios: [] // 根据标签过滤后的作品
  },

  onLoad(options) {
    this.loadPortfolios();
  },

  // 加载作品数据
  loadPortfolios() {
    // 模拟从云数据库获取全部作品数据
    // 这里的图片和数据也是完美复刻您的要求
    const mockData = [
      {
        id: '1',
        title: '云端豪宅',
        category: '住宅照明',
        tag: '住宅',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYTFuymSmJJcRmsh0Qg_qaY95PQT406Hr7uevIh9R0neg1AWRsiPG-aSC5LHZJO16x0juLRo7fAEUIjXkHe8WhOQQoG0UqsMG5beTy1tpAcqSikbIhQD3ReGilmGaiaKnE8P5DyIMvLVhguQveI-una49fC9bYmRR3r9kFDwD0YfqPKdXWzuCHj56M-JoZpMgM-6WU8fVuUyEw24C4dm-nYPqQHfG84xicRUUAmJ-5INGI7xF2cf0_7I0e77RvIE1Oi5pMriPkxf0'
      },
      {
        id: '2',
        title: '星际酒店大堂',
        category: '商业空间',
        tag: '商业',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA6JJJfXh7ru_dn1jm4puVxH-5HRoFWaFC1hKet_V6oxPRvu_PzKQdXRT7AeGsPtJOJQTKkb_emPlFr3lK7pzIOiu1MS8sI3V9dm8VUVzlkNk2BJh-gStnU98A1zEb-rBB0nj6nwO3eCJ0faL4arBDjhmTYbX6Cebcf-C01Q8M_KjB-rqNOdHHJtVRHz6pgraSzWiJeYHDvglzgYoCB0hvhpcUyqNYk2A9_77npCzpe3uMwAuACOFnoCMhwPRX10C1A52cjCfu0coQ'
      },
      {
        id: '3',
        title: '光之回响',
        category: '艺术装置',
        tag: '艺术装置',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBg_5K4vY63o8sRgbJvqLHp3Wq1SsQAx_jVG6bVpqG1ykq6bq9V_so0heIrWt1DjlxHWmkGwyk0kYNrHYsVNHyXb2a2cHqof08dMKkv_5b8JUqu-4RroQebhyczs7rVcCSDHcAh8deigCnhYDFElAenYGyXG_2i0ZQucV-upKgxyHDookxCRU86zH7obhs9aGiQfbc_TktHaz0o9CEng7LtJOL4M647cNfIXCZyBe_lMFHqtxrEl5EUTTqOU2-fUaU8wFdpEYUZoaQ'
      },
      {
        id: '4',
        title: '暖光卧室',
        category: '住宅照明',
        tag: '住宅',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDuN3TFS5-VSdfxhfJQnei8egRfipewOohw0vYhxzFzkiWskg7mEwB3hKVghUKipjcEMBlBAdSgG7jcs-SP9aHi4RQL5TtBJIQZmBfB-cBRjICGsgXZsagKunOEWAee5iyveyM-0QLFJceONBJlxKkdb2FbOgJqWe3vg04Gyt-8x8IYMV8l41bGa1sFzkf0HA-GoU_LzqXvpzIoCVwuavtgWJPtEnyAO4ggIoi_WvMAsSWB7taM7dcAKOezQTsaFISLeieCAJmvqSs'
      },
      {
        id: '5',
        title: '极简工作室',
        category: '办公空间',
        tag: '商业',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuByNpBIkNQZ2qh5GdQPW1bcwc3Vy5ldHoFOEF4ywe2WKSqrB9UdKymUNN2jvBZ__BmblcN8rhxjZK3NK1E1moB2yc1Qqdzd2c4HAQ-LBfc2Qw_832qPT6GKzV6_B82qNve4HEADJnB1BWM8EU9lX5zHcJfQCXAsLzFStwe1w3AjKZH0Mg9Gk106_AX7l7dyjGjpy8Ub3Du1yaS0-dKwPP51nLYrzfsHt7m0G1j5itbfA7DxVDHRh_RN-r3bHsei9DtMSaYTwHxMRxc'
      },
      {
        id: '6',
        title: '夜色庭院',
        category: '景观照明',
        tag: '景观',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD0bgY_oZy5X12CgJ9sHK0Qs11Nq0T2QqbvbdS_lsPRswSYmqPOgnS7tW25YIabkXvbR3HEDBX0dXIfOj0su1qEEj0WtshunRbdM65n8LKrelJTaoewQLGornDjn9C4l4FB67C7k_hDJN1ZIeEeXMcO5F98k8S1Nij974OhLfZhKfpNICXSUN9XMoerpdlC8CBxc_De1nf2ZGYBgeOTrLu-qIzJ0m5jEEhAYxp6hmNSzC4bHt33ID0tG1omKRiyTqOgs2tcoqXX9sA'
      },
      {
        id: '7',
        title: '静谧书店',
        category: '商业空间',
        tag: '商业',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuArp6vgCwNHwBymlOS9u_a-wwOkHK3lz7SEf248cWGEKaihj35LVrxjh4M_1j7JQCx1jzI1TMB9EkN_eqjkhsXgh3AHonmU8u5frTy7FrrqZovEz1D_n63osUgNnaNVIwtEMh0wdaYsojmtA6J7GSKVJ9GHqNLXI14vRhdNWeVpwpr3AjqAT-b5Lhqj0uUq_GX8MjXSiLZKtXVXnUG1ceaAzzF5XNXnHGn47MwceZnBhqLOTfjO_0p1hTHcEj5_ERUFT53b0o-7T34'
      },
      {
        id: '8',
        title: '原木之家',
        category: '住宅照明',
        tag: '住宅',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXTHhX_PKG_HcTejuOX9sSge-VmpCqBs6k2dRZ_nQQNQTvuD0FLDCt2ZIo38pw_B-9FdnLCDE2vuQLruXuR1g3ry0VYR0aXoIGJkoR8zCCltIGZ2SaSmIGdy7oChRTZ83EyzwYPJjCExe28zQyHtRtQqIuUBvNHZajdOYlSqgfCgvUhwfCVjsA_rd3CJy1i-cpMGXNNsE7HR4dbaTRIg_np-_3DCxlAw58ZQ9o4KVvRed6btK26geu3Dce1iWtiQd_bBijXAg-9Ms'
      }
    ];

    this.setData({
      portfolios: mockData,
      filteredPortfolios: mockData
    });
  },

  // 标签点击切换
  onTabClick(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });
    this.filterPortfolios(tab);
  },

  // 根据标签筛选作品
  filterPortfolios(tab) {
    const { portfolios } = this.data;
    if (tab === '全部') {
      this.setData({ filteredPortfolios: portfolios });
    } else {
      const filtered = portfolios.filter(item => item.tag === tab);
      this.setData({ filteredPortfolios: filtered });
    }
  },

  // 点击作品进入详情
  onPortfolioDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({
      title: '查看作品详情: ' + id,
      icon: 'none'
    });
    // 实际业务中跳转到作品详情页
    // wx.navigateTo({ url: `/pages/portfolio-detail/portfolio-detail?id=${id}` });
  }
});
