Page({
  data:{
    items:[
      {id:'1', name:'住宅客厅照明', status:'设计中', desc:'概念方案已提交，进行照度计算', time:'2025-08-12'},
      {id:'2', name:'商业橱窗重点照明', status:'待勘测', desc:'等待现场测量与灯位确认', time:'2025-08-08'}
    ]
  },
  onView(e){
    const id=e.currentTarget.dataset.id
    wx.showModal({title:'进度',content:`需求 ${id} 的进度示例展示（演示）`,showCancel:false})
  }
})


