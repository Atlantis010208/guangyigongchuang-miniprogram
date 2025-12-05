Page({
  data:{
    title:'配件列表',
    items:[]
  },

  onLoad(options){
    const title = options && options.title ? decodeURIComponent(options.title) : '配件列表'
    const items = this.getItemsByTitle(title)
    this.setData({ title, items })
  },

  getItemsByTitle(title){
    const common = [
      {id:1,img:'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MX2D3?wid=200&hei=200&fmt=jpeg&qlt=90&.v=1694014878072',brand:'免费镌刻服务',name:'AirPods Pro 2',price:1899,colors:['#d8d8d8','#ffffff','#efefef']},
      {id:2,img:'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/iphone-16-pro-clear-case-magsafe-202409?wid=200&hei=200&fmt=jpeg&qlt=90&.v=1724270587560',name:'iPhone 16 Pro 专用 MagSafe 透明保护壳',price:399,colors:['#f5e7c9']}
    ]

    const map = {
      '导轨灯/洗墙灯': [
        {id:101,img:'https://images.pexels.com/photos/231036/pexels-photo-231036.jpeg',brand:'轨道灯',name:'导轨聚光灯 15-36°',price:699,colors:['#000','#ddd']},
        {id:102,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'洗墙灯',name:'线性洗墙灯 12W',price:499,colors:['#ccc','#eee']}
      ],
      '射灯/格栅灯': [
        {id:201,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'射灯',name:'可调角射灯 7W',price:269,colors:['#000','#fff']},
        {id:202,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'格栅灯',name:'三头格栅 18W',price:399,colors:['#ddd']}
      ],
      '健康与照度': [
        {id:301,img:'https://images.pexels.com/photos/373548/pexels-photo-373548.jpeg',brand:'健康',name:'低蓝光台灯',price:199,colors:['#fff','#eaeaea']},
        {id:302,img:'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg',brand:'照度',name:'桌面照度计',price:299,colors:['#666']}
      ],
      '电源与驱动': [
        {id:401,img:'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg',brand:'驱动',name:'恒流驱动 350mA',price:69,colors:['#bbb']},
        {id:402,img:'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg',brand:'电源',name:'24V 电源适配器',price:129,colors:['#999']}
      ],
      '支架/配件': [
        {id:501,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'配件',name:'导轨 1m',price:59,colors:['#111']},
        {id:502,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'支架',name:'天花安装支架',price:39,colors:['#888']}
      ],
      '声光与控制': [
        {id:601,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'控制',name:'蓝牙调光控制器',price:199,colors:['#7f7fff']},
        {id:602,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'声光',name:'声光控开关',price:129,colors:['#ccc']}
      ],

      '灯带与氛围光': [
        {id:701,img:'https://images.pexels.com/photos/461850/pexels-photo-461850.jpeg',brand:'氛围',name:'RGB 灯带 5m',price:159,colors:['#ff5','#5ff','#f5f']},
        {id:702,img:'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg',brand:'氛围',name:'CCT 可调灯带',price:139,colors:['#fff','#ffd9a0']}
      ],
      '轨道灯/射灯': [
        {id:801,img:'https://images.pexels.com/photos/231036/pexels-photo-231036.jpeg',brand:'轨道灯',name:'15W 导轨灯',price:299,colors:['#000','#ccc']},
        {id:802,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'射灯',name:'10W 射灯',price:199,colors:['#ddd']}
      ],
      '健康与护眼': [
        {id:901,img:'https://images.pexels.com/photos/373548/pexels-photo-373548.jpeg',brand:'护眼',name:'UGR≤16 护眼台灯',price:299,colors:['#fff']}
      ],
      '线性灯/面板灯': [
        {id:1001,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'线性',name:'线性灯 30W',price:359,colors:['#ccc']},
        {id:1002,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'面板',name:'面板灯 600x600',price:299,colors:['#ddd']}
      ],
      '壁灯/台灯/氛围灯': [
        {id:1101,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'壁灯',name:'卧室壁灯',price:199,colors:['#ddd']},
        {id:1102,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'台灯',name:'床头台灯',price:159,colors:['#eee']}
      ],
      '射灯/洗墙灯': [
        {id:1201,img:'https://images.pexels.com/photos/231036/pexels-photo-231036.jpeg',brand:'射灯',name:'7W 射灯',price:199,colors:['#ccc']},
        {id:1202,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'洗墙灯',name:'洗墙灯 18W',price:399,colors:['#aaa']}
      ],
      '支架/导轨配件': [
        {id:1301,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'导轨',name:'1.5m 导轨',price:89,colors:['#111']}
      ],
      '照度/UGR计算': [
        {id:1401,img:'https://images.pexels.com/photos/373548/pexels-photo-373548.jpeg',brand:'工具',name:'照度/UGR 评估套餐',price:0,colors:['#ddd']}
      ],
      '灯具清单选型': [
        {id:1501,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'服务',name:'灯具清单选型服务',price:0,colors:['#ddd']}
      ],
      '控制系统设计': [
        {id:1601,img:'https://images.pexels.com/photos/586415/pexels-photo-586415.jpeg',brand:'服务',name:'控制系统设计服务',price:0,colors:['#ccc']}
      ],
      '施工配合指导': [
        {id:1701,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'服务',name:'施工配合指导服务',price:0,colors:['#ddd']}
      ],
      '调试与验收': [
        {id:1801,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'服务',name:'调试与验收服务',price:0,colors:['#ddd']}
      ],

      // 三个入口的“图片样式网格”数据
      '发布照明需求': [
        {id:1901,img:'https://images.pexels.com/photos/704647/pexels-photo-704647.jpeg',brand:'场景',name:'居住空间方案包',price:0,colors:['#ddd']},
        {id:1902,img:'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',brand:'场景',name:'商业空间方案包',price:0,colors:['#ccc']}
      ],
      '预约现场勘测': [
        {id:2001,img:'https://images.pexels.com/photos/2381463/pexels-photo-2381463.jpeg',brand:'服务',name:'到场测量·打样',price:0,colors:['#bbb']},
        {id:2002,img:'https://images.pexels.com/photos/260931/pexels-photo-260931.jpeg',brand:'服务',name:'现场光环境评估',price:0,colors:['#aaa']}
      ],
      '申请概念方案': [
        {id:2101,img:'https://images.pexels.com/photos/271753/pexels-photo-271753.jpeg',brand:'方案',name:'概念光影表达',price:0,colors:['#ddd']},
        {id:2102,img:'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',brand:'方案',name:'风格与配光建议',price:0,colors:['#ccc']}
      ]
    }

    return (map[title] || common)
  }
})



