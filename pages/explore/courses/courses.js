Page({
  data:{
    // 从周日开始，符合常见日历顺序
    weekdays:['日','一','二','三','四','五','六'],
    weeks:[], // 本周 + 未来两周
    weekIndex:0, // swiper 当前页（0: 本周, 1/2: 未来两周）
    currentIndex:0,
    items:[
      {id:1,title:'Apple 夏令营：用 iPad 执导一部关于友情的短片',time:'10:30 - 12:00',place:'Apple 深圳益田假日广场'},
      {id:2,title:'儿童：制作属于自己的表情符号',time:'11:00 - 12:00',place:'Apple 珠江新城'},
      {id:3,title:'Apple 夏令营：用 iPad 执导一部关于友情的短片',time:'11:00 - 12:30',place:'Apple 深圳万象城'},
      {id:4,title:'轻松入门：Mac',time:'12:00 - 13:00',place:'Apple 深圳益田假日广场'}
    ]
  },
  onLoad(){
    this.generateWeeks()
  },
  onShow(){
    // 返回页面时根据当前日期实时刷新
    this.generateWeeks()
  },
  // 生成本周与下周的日期
  generateWeeks(){
    const today = new Date()
    // 本周起始（周日）
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())

    // 生成 n 周数据（共 3 周：本周 + 未来两周）
    const buildWeek = (weekOffset)=>{
      const weekStart = new Date(startOfWeek)
      weekStart.setDate(startOfWeek.getDate() + weekOffset*7)
      const days = []
      for (let i=0;i<7;i++){
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate()+i)
        days.push({
          y: d.getFullYear(),
          m: d.getMonth()+1,
          d: d.getDate(),
          weekday: d.getDay(), // 0-6
          ts: d.getTime()
        })
      }
      return days
    }

    const weeks = [buildWeek(0), buildWeek(1), buildWeek(2)]

    // 当前索引为今天在第 0 周中的位置
    const todayIndex = today.getDay()
    this.setData({ weeks, weekIndex:0, currentIndex: todayIndex })
  },
  onWeekChange(e){ this.setData({ weekIndex: e.detail.current, currentIndex:0 }) },
  onPickDate(e){
    const index = e.currentTarget.dataset.index
    this.setData({ currentIndex:index })
  },
  onNear(){ wx.showToast({ title:'打开附近课程', icon:'none' }) },
  // 已移除筛选入口
})

