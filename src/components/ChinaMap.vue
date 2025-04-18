<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
    <div class="map-controls">
      <button @click="enableBoxSelect" :class="{ active: selectionMode === 'box' }" title="在地图上拖动鼠标绘制矩形区域">区域框选</button>
      <button @click="enablePointSelect" :class="{ active: selectionMode === 'point' }" title="点击地图标记位置">点选</button>
      <button @click="clearSelection" title="清除所有已选择的区域和点">清除选择</button>
    </div>
    <div class="map-layers-control">
      <div class="control-title">地图类型</div>
      <div class="layer-options">
        <button @click="switchLayer('osm')" :class="{ active: currentLayer === 'osm' }">标准地图</button>
        <button @click="switchLayer('terrain')" :class="{ active: currentLayer === 'terrain' }">地形图</button>
        <button @click="switchLayer('satellite')" :class="{ active: currentLayer === 'satellite' }">卫星图</button>
        <button @click="switchLayer('admin')" :class="{ active: currentLayer === 'admin' }">行政区图</button>
      </div>
    </div>
    <div v-if="selectedItems.length > 0" class="selection-info">
      <h3>已选择 {{ selectedItems.length }} 项</h3>
      <div class="selection-list">
        <div v-for="(item, index) in selectedItems" :key="index" class="selection-item">
          <span v-if="item.type === 'area'">区域 #{{ index + 1 }}: {{ formatBounds(item.bounds) }}</span>
          <span v-else-if="item.type === 'point'">点 #{{ index + 1 }}: {{ formatLatLng(item.latlng) }}</span>
          <button @click="removeItem(index)" class="remove-btn" title="移除此项">×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { onMounted, ref, onUnmounted } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

export default {
  name: 'ChinaMap',
  setup() {
    const mapContainer = ref(null);
    const map = ref(null);
    const selectionMode = ref('none');
    const drawnItems = ref(null);
    const drawControl = ref(null);
    const activeDrawer = ref(null);
    const selectedItems = ref([]);
    const currentLayer = ref('osm');
    const baseLayers = ref({});
    
    // 格式化经纬度
    const formatLatLng = (latlng) => {
      return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    };
    
    // 格式化边界
    const formatBounds = (bounds) => {
      return `${bounds._southWest.lat.toFixed(4)}, ${bounds._southWest.lng.toFixed(4)} 至 ${bounds._northEast.lat.toFixed(4)}, ${bounds._northEast.lng.toFixed(4)}`;
    };
    
    // 移除指定项
    const removeItem = (index) => {
      if (index >= 0 && index < selectedItems.value.length) {
        // 获取要移除的项目
        const item = selectedItems.value[index];
        
        // 从选择列表中移除
        selectedItems.value.splice(index, 1);
        
        // 从地图绘制层移除
        drawnItems.value.removeLayer(item.layer);
      }
    };
    
    // 切换地图图层
    const switchLayer = (layerName) => {
      if (currentLayer.value === layerName) return;
      
      // 移除当前图层
      if (baseLayers.value[currentLayer.value]) {
        map.value.removeLayer(baseLayers.value[currentLayer.value]);
      }
      
      // 添加新图层
      if (baseLayers.value[layerName]) {
        map.value.addLayer(baseLayers.value[layerName]);
        currentLayer.value = layerName;
      }
    };
    
    // 初始化地图
    const initMap = () => {
      // 设置中国地图的中心点和缩放级别
      map.value = L.map(mapContainer.value).setView([35.86166, 104.195397], 4);
      
      // 创建不同的底图图层
      
      // 1. OpenStreetMap (标准地图)
      baseLayers.value.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      
      // 2. 地形图 (Stamen Terrain)
      baseLayers.value.terrain = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png', {
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: 'abcd',
        minZoom: 0,
        maxZoom: 18
      });
      
      // 3. 卫星图 (Esri World Imagery)
      baseLayers.value.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });
      
      // 4. 行政区图 (高德地图行政区划)
      baseLayers.value.admin = L.tileLayer('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}', {
        subdomains: "1234",
        attribution: '&copy; <a href="https://www.amap.com/">高德地图</a>'
      });
      
      // 默认添加标准地图图层
      baseLayers.value.osm.addTo(map.value);
      
      // 初始化绘制图层
      drawnItems.value = new L.FeatureGroup();
      map.value.addLayer(drawnItems.value);
      
      // 配置绘制控件
      drawControl.value = new L.Control.Draw({
        draw: {
          polyline: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polygon: false,
          rectangle: {
            shapeOptions: {
              color: '#3498db',
              weight: 3
            }
          }
        },
        edit: {
          featureGroup: drawnItems.value,
          remove: true
        }
      });
      
      // 添加绘制控件到地图
      map.value.addControl(drawControl.value);
      
      // 监听绘制完成事件
      map.value.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;
        drawnItems.value.addLayer(layer);
        
        // 记录选择的区域或点
        if (event.layerType === 'rectangle') {
          selectedItems.value.push({
            type: 'area',
            bounds: layer.getBounds(),
            layer: layer
          });
        } else if (event.layerType === 'marker') {
          selectedItems.value.push({
            type: 'point',
            latlng: layer.getLatLng(),
            layer: layer
          });
        }
        
        // 获取选中区域的坐标信息
        const selectedArea = layer.toGeoJSON();
        console.log('选中区域:', selectedArea);
        
        // 如果当前是框选模式，自动启用新的框选工具
        if (selectionMode.value === 'box') {
          setTimeout(() => {
            enableBoxSelect();
          }, 100);
        }
      });
      
      // 监听编辑完成事件
      map.value.on(L.Draw.Event.EDITED, (event) => {
        const layers = event.layers;
        layers.eachLayer((layer) => {
          // 更新已编辑图层的信息
          const editedItem = selectedItems.value.find(item => item.layer === layer);
          if (editedItem) {
            if (editedItem.type === 'area') {
              editedItem.bounds = layer.getBounds();
            } else if (editedItem.type === 'point') {
              editedItem.latlng = layer.getLatLng();
            }
          }
          
          const editedArea = layer.toGeoJSON();
          console.log('编辑后的区域:', editedArea);
        });
      });
      
      // 监听删除完成事件
      map.value.on(L.Draw.Event.DELETED, (event) => {
        const layers = event.layers;
        layers.eachLayer((layer) => {
          // 从选择列表中移除已删除的图层
          const index = selectedItems.value.findIndex(item => item.layer === layer);
          if (index !== -1) {
            selectedItems.value.splice(index, 1);
          }
        });
        
        console.log('已删除选中区域');
      });
    };
    
    // 禁用当前所有选择模式
    const disableAllSelectionModes = () => {
      // 禁用当前活动的绘制工具
      if (activeDrawer.value) {
        activeDrawer.value.disable();
        activeDrawer.value = null;
      }
      
      // 移除点选事件处理器
      if (map.value && map.value._pointSelectHandler) {
        map.value.off('click', map.value._pointSelectHandler);
        map.value._pointSelectHandler = null;
      }
    };
    
    // 启用区域框选
    const enableBoxSelect = () => {
      // 如果已经是框选模式，不做任何操作
      if (selectionMode.value === 'box') {
        return;
      }
      
      // 先禁用所有选择模式
      disableAllSelectionModes();
      
      // 设置选择模式为框选
      selectionMode.value = 'box';
      
      // 创建新的矩形绘制工具并启用
      activeDrawer.value = new L.Draw.Rectangle(map.value, {
        shapeOptions: {
          color: '#42b983',
          weight: 3
        }
      });
      activeDrawer.value.enable();
    };
    
    // 启用点选
    const enablePointSelect = () => {
      // 如果已经是点选模式，不做任何操作
      if (selectionMode.value === 'point') {
        return;
      }
      
      // 先禁用所有选择模式
      disableAllSelectionModes();
      
      // 设置选择模式为点选
      selectionMode.value = 'point';
      
      // 添加新的点击事件处理器
      map.value._pointSelectHandler = (e) => {
        const marker = L.marker(e.latlng).addTo(drawnItems.value);
        
        // 记录新添加的点
        selectedItems.value.push({
          type: 'point',
          latlng: e.latlng,
          layer: marker
        });
        
        console.log('选中点:', e.latlng);
      };
      
      map.value.on('click', map.value._pointSelectHandler);
    };
    
    // 清除选择
    const clearSelection = () => {
      // 清除所有已绘制的图层
      drawnItems.value.clearLayers();
      
      // 清空选择列表
      selectedItems.value = [];
      
      // 禁用所有选择模式
      disableAllSelectionModes();
      
      // 重置选择模式
      selectionMode.value = 'none';
    };
    
    onMounted(() => {
      // 初始化地图
      initMap();
    });
    
    onUnmounted(() => {
      // 清理地图资源
      if (map.value) {
        map.value.remove();
      }
    });
    
    return {
      mapContainer,
      selectionMode,
      selectedItems,
      currentLayer,
      enableBoxSelect,
      enablePointSelect,
      clearSelection,
      removeItem,
      formatLatLng,
      formatBounds,
      switchLayer
    };
  }
};
</script>

<style scoped>
.map-container {
  position: relative;
  width: 100%;
  flex: 1;
  overflow: hidden;
  border-radius: 0;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
}

#map {
  width: 100%;
  height: 100%;
}

.map-controls {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  gap: 8px;
  background-color: white;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.map-layers-control {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  background-color: white;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.control-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #2c3e50;
}

.layer-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-controls button,
.layer-options button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 14px;
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #505050;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  white-space: nowrap;
}

.map-controls button::before,
.layer-options button::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  z-index: -1;
}

.map-controls button.active,
.layer-options button.active {
  background-color: #3498db;
  color: white;
  border-color: #3498db;
  box-shadow: 0 2px 5px rgba(52, 152, 219, 0.3);
}

.map-controls button:hover,
.layer-options button:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.1);
  background-color: #f8f9fa;
}

.map-controls button.active:hover,
.layer-options button.active:hover {
  background-color: #2980b9;
}

.selection-info {
  position: absolute;
  bottom: 20px;
  left: 20px;
  z-index: 1000;
  background-color: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  max-width: 350px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.selection-info:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.selection-info h3 {
  margin-top: 0;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}

.selection-list {
  font-size: 13px;
}

.selection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
  padding: 5px;
  border-radius: 4px;
}

.selection-item:hover {
  background-color: #f8f9fa;
}

.selection-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.remove-btn {
  background: none;
  border: none;
  color: #e74c3c;
  cursor: pointer;
  font-size: 18px;
  padding: 0 5px;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.remove-btn:hover {
  background-color: rgba(231, 76, 60, 0.1);
  transform: scale(1.1);
}

@media (max-width: 768px) {
  .map-controls {
    top: 10px;
    right: 10px;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
  }
  
  .map-layers-control {
    top: 10px;
    left: 10px;
    padding: 8px;
  }
  
  .layer-options button {
    padding: 6px 10px;
    font-size: 12px;
  }
  
  .selection-info {
    bottom: 10px;
    left: 10px;
    max-width: calc(100% - 40px);
    max-height: 200px;
    padding: 10px;
  }
}
</style> 