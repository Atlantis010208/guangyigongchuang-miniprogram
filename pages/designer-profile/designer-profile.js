Page({
  data: {
    user: {
      name: '张伟',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDlt_6-cZUO6qjroX1AXEu-wtMYE02ryL-K4rHCfhgcBWl55SjnQ46sUbkWeY4myh6udonIinxC2kl40TgyNm_lLLjoGi6S-BBYVGs9_IZJIDvhv1ibdkNpIiJ_aNMgrG_ARvgXTUAoAOL5y2SK7-qeY4P8aM8PF4fg2E1zkN97ZE-APv59lMyAfXyJUG2-cT1LLm51JH1CsxHy2qoymF9TPYgd1Rbi4sYkJ4OfvF4rMvr3XTifGmiZhOmXcnxjKDy2IECJ9hvAcFc',
      title: '资深灯光设计师，专注室内照明与光影美学。',
      stats: {
        projects: 12,
        rating: 4.9,
        years: 8
      }
    },
    portfolios: [
      {
        id: 1,
        title: '云端豪宅',
        category: '住宅照明',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYTFuymSmJJcRmsh0Qg_qaY95PQT406Hr7uevIh9R0neg1AWRsiPG-aSC5LHZJO16x0juLRo7fAEUIjXkHe8WhOQQoG0UqsMG5beTy1tpAcqSikbIhQD3ReGilmGaiaKnE8P5DyIMvLVhguQveI-una49fC9bYmRR3r9kFDwD0YfqPKdXWzuCHj56M-JoZpMgM-6WU8fVuUyEw24C4dm-nYPqQHfG84xicRUUAmJ-5INGI7xF2cf0_7I0e77RvIE1Oi5pMriPkxf0'
      },
      {
        id: 2,
        title: '星际酒店大堂',
        category: '商业空间',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA6JJJfXh7ru_dn1jm4puVxH-5HRoFWaFC1hKet_V6oxPRvu_PzKQdXRT7AeGsPtJOJQTKkb_emPlFr3lK7pzIOiu1MS8sI3V9dm8VUVzlkNk2BJh-gStnU98A1zEb-rBB0nj6nwO3eCJ0faL4arBDjhmTYbX6Cebcf-C01Q8M_KjB-rqNOdHHJtVRHz6pgraSzWiJeYHDvglzgYoCB0hvhpcUyqNYk2A9_77npCzpe3uMwAuACOFnoCMhwPRX10C1A52cjCfu0coQ'
      },
      {
        id: 3,
        title: '光之回响',
        category: '艺术装置',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBg_5K4vY63o8sRgbJvqLHp3Wq1SsQAx_jVG6bVpqG1ykq6bq9V_so0heIrWt1DjlxHWmkGwyk0kYNrHYsVNHyXb2a2cHqof08dMKkv_5b8JUqu-4RroQebhyczs7rVcCSDHcAh8deigCnhYDFElAenYGyXG_2i0ZQucV-upKgxyHDookxCRU86zH7obhs9aGiQfbc_TktHaz0o9CEng7LtJOL4M647cNfIXCZyBe_lMFHqtxrEl5EUTTqOU2-fUaU8wFdpEYUZoaQ'
      },
      {
        id: 4,
        title: '暖光卧室',
        category: '住宅照明',
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDuN3TFS5-VSdfxhfJQnei8egRfipewOohw0vYhxzFzkiWskg7mEwB3hKVghUKipjcEMBlBAdSgG7jcs-SP9aHi4RQL5TtBJIQZmBfB-cBRjICGsgXZsagKunOEWAee5iyveyM-0QLFJceONBJlxKkdb2FbOgJqWe3vg04Gyt-8x8IYMV8l41bGa1sFzkf0HA-GoU_LzqXvpzIoCVwuavtgWJPtEnyAO4ggIoi_WvMAsSWB7taM7dcAKOezQTsaFISLeieCAJmvqSs'
      }
    ]
  },

  onLoad(options) {
    // 页面加载时的逻辑
  },

  onSettings() {
    wx.showToast({
      title: '设置',
      icon: 'none'
    });
  },

  onEditProfile() {
    wx.navigateTo({
      url: '/pages/designer-profile-edit/designer-profile-edit'
    });
  },

  onAddPortfolio() {
    wx.navigateTo({
      url: '/pages/designer-portfolio-add/designer-portfolio-add'
    });
  },

  onViewAllPortfolios() {
    wx.navigateTo({
      url: '/pages/designer-portfolios/designer-portfolios'
    });
  },

  onPortfolioDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({
      title: '作品详情: ' + id,
      icon: 'none'
    });
  }
});
