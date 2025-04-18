<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
    <div class="map-controls">
      <div class="control-title">选择方式</div>
      <button @click="enableBoxSelect" :class="{ active: selectionMode === 'box' }" title="在地图上拖动鼠标绘制矩形区域">框选</button>
      <button @click="enablePointSelect" :class="{ active: selectionMode === 'point' }" title="点击地图标记位置">点选</button>
      <button @click="clearSelection" title="清除所有已选择的区域和点">清除</button>
      <div class="map-layers-control">
        <div class="control-title">地图类型</div>
        <div class="layer-options">
          <button @click="switchLayer('osm')" :class="{ active: currentLayer === 'osm' }">标准图</button>
          <button @click="switchLayer('terrain')" :class="{ active: currentLayer === 'terrain' }">
            地形图
            <span v-if="layerLoading === 'terrain'" class="loading-indicator"></span>
          </button>
          <button @click="switchLayer('satellite')" :class="{ active: currentLayer === 'satellite' }">
            卫星图
            <span v-if="layerLoading === 'satellite'" class="loading-indicator"></span>
          </button>
          <button @click="switchLayer('admin')" :class="{ active: currentLayer === 'admin' }">
            行政图
            <span v-if="layerLoading === 'admin'" class="loading-indicator"></span>
          </button>
        </div>
      </div>
    </div>
    <div v-if="mapError" class="map-error-notice">
      <span>{{ mapError }}</span>
      <button @click="dismissError" class="dismiss-btn">×</button>
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
import {onMounted, onUnmounted, ref} from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

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
    const layerLoading = ref(null);
    const mapError = ref('');
    const loadTimers = ref({});

    // 格式化经纬度
    const formatLatLng = (latlng) => {
      return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    };

    // 格式化边界
    const formatBounds = (bounds) => {
      return `${bounds._southWest.lat.toFixed(4)}, ${bounds._southWest.lng.toFixed(4)} 至 ${bounds._northEast.lat.toFixed(4)}, ${bounds._northEast.lng.toFixed(4)}`;
    };

    // 关闭错误提示
    const dismissError = () => {
      mapError.value = '';
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

      // 设置加载状态
      layerLoading.value = layerName;

      // 移除当前图层
      if (baseLayers.value[currentLayer.value]) {
        map.value.removeLayer(baseLayers.value[currentLayer.value]);
      }

      // 清除之前的错误
      mapError.value = '';

      // 添加新图层
      if (baseLayers.value[layerName]) {
        // 如果是地形图，并且有备选图层，考虑使用备选
        if (layerName === 'terrain' && baseLayers.value.terrainAlt) {
          // 如果主地形图已经尝试过并失败，直接使用备选
          if (baseLayers.value.terrain._failedToLoad) {
            map.value.addLayer(baseLayers.value.terrainAlt);
            currentLayer.value = layerName;
            layerLoading.value = null;
            return;
          }
        }

        // 添加请求的图层
        map.value.addLayer(baseLayers.value[layerName]);
        currentLayer.value = layerName;

        // 设置超时检查，如果图层在一定时间内没有加载成功，显示错误
        if (loadTimers.value[layerName]) {
          clearTimeout(loadTimers.value[layerName]);
        }

        loadTimers.value[layerName] = setTimeout(() => {
          if (layerLoading.value === layerName) {
            // 检查是否有备选图层可以使用
            if (layerName === 'terrain' && !baseLayers.value.terrain._loaded) {
              console.log('地形图加载超时，尝试备选地形图');

              // 标记主地形图加载失败
              baseLayers.value.terrain._failedToLoad = true;

              // 移除主地形图
              map.value.removeLayer(baseLayers.value.terrain);

              // 确保备选地形图存在
              if (!baseLayers.value.terrainAlt) {
                baseLayers.value.terrainAlt = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                  attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
                  maxZoom: 17
                });

                handleLayerEvents('terrainAlt', baseLayers.value.terrainAlt);
              }

              // 添加备选地形图
              map.value.addLayer(baseLayers.value.terrainAlt);
            } else {
              // 显示错误信息
              mapError.value = `${getLayerName(layerName)}加载失败，请检查网络连接或尝试其他地图类型`;

              // 回退到标准地图
              if (currentLayer.value !== 'osm') {
                map.value.removeLayer(baseLayers.value[currentLayer.value]);
                map.value.addLayer(baseLayers.value.osm);
                currentLayer.value = 'osm';
              }
            }

            layerLoading.value = null;
          }
        }, 8000); // 8秒超时
      }
    };

    // 获取图层的显示名称
    const getLayerName = (layerKey) => {
      const names = {
        osm: '标准地图',
        terrain: '地形图',
        satellite: '卫星图',
        admin: '行政区图'
      };
      return names[layerKey] || layerKey;
    };

    // 监听图层加载事件和错误事件
    const handleLayerEvents = (layerName, layer) => {
      layer.on('tileerror', (error) => {
        console.error(`${layerName} 图层加载错误:`, error);

        // 标记该图层加载失败
        layer._failedToLoad = true;

        // 如果是地形图加载失败，自动切换到备选地形图
        if (layerName === 'terrain' && currentLayer.value === 'terrain') {
          if (!baseLayers.value.terrainAlt) {
            console.log('尝试加载备选地形图...');
            baseLayers.value.terrainAlt = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
              attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
              maxZoom: 17
            });

            // 监听备选图层事件
            baseLayers.value.terrainAlt.on('load', () => {
              console.log('备选地形图加载成功');
              layerLoading.value = null;

              if (loadTimers.value[layerName]) {
                clearTimeout(loadTimers.value[layerName]);
              }
            });

            baseLayers.value.terrainAlt.on('tileerror', () => {
              console.error('备选地形图也加载失败');
              // 如果备选也失败，回退到标准地图
              map.value.removeLayer(baseLayers.value.terrainAlt);
              map.value.addLayer(baseLayers.value.osm);
              currentLayer.value = 'osm';
              layerLoading.value = null;

              mapError.value = '所有地形图源都加载失败，已切换回标准地图';

              if (loadTimers.value[layerName]) {
                clearTimeout(loadTimers.value[layerName]);
              }
            });

            map.value.removeLayer(layer);
            map.value.addLayer(baseLayers.value.terrainAlt);
          }
        }
      });

      layer.on('load', () => {
        console.log(`${layerName} 图层加载成功`);
        layer._loaded = true;

        // 如果是当前正在加载的图层，取消加载状态
        if (layerLoading.value === layerName) {
          layerLoading.value = null;

          if (loadTimers.value[layerName]) {
            clearTimeout(loadTimers.value[layerName]);
          }
        }
      });
    };

    // 初始化地图
    const initMap = () => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl,
        iconUrl,
        shadowUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        tooltipAnchor: [16, -28],
        shadowSize: [41, 41]
      });

      // 设置中国地图的中心点和缩放级别
      map.value = L.map(mapContainer.value).setView([35.86166, 104.195397], 4);

      // 创建不同的底图图层

      // 1. OpenStreetMap (标准地图)
      baseLayers.value.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });

      // 2. 地形图 (使用多个可能的源)
      const terrainUrls = [
        // Thunderforest地形图 (需要API key)
        'https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=04304bc87bce490f92ab8feb966fbe3e',
        // OpenTopoMap地形图
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
      ];

      baseLayers.value.terrain = L.tileLayer(terrainUrls[0], {
        attribution: 'Maps &copy; <a href="https://www.thunderforest.com">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 22
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

      // 为每个图层添加事件监听
      Object.keys(baseLayers.value).forEach(key => {
        handleLayerEvents(key, baseLayers.value[key]);
      });

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

      // 默认添加标准地图图层
      baseLayers.value.osm.addTo(map.value);
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
      layerLoading,
      mapError,
      enableBoxSelect,
      enablePointSelect,
      clearSelection,
      removeItem,
      formatLatLng,
      formatBounds,
      switchLayer,
      dismissError
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
  flex-direction: column;
  gap: 8px;
  background-color: rgba(255, 255, 255, 0.92);
  padding: 14px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.8);
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  max-width: 180px;
}

.map-controls:hover {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.map-layers-control {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.07);
}

.control-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #2c3e50;
  position: relative;
  padding-left: 6px;
  letter-spacing: 0.5px;
}

.control-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  background-color: #3498db;
  border-radius: 3px;
}

.layer-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-controls button,
.layer-options button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 14px;
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #505050;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  white-space: nowrap;
  width: 100%;
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
  border-color: rgba(52, 152, 219, 0.5);
  box-shadow: 0 4px 8px rgba(52, 152, 219, 0.25);
  font-weight: 600;
}

.map-controls button:hover,
.layer-options button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
  background-color: #f8f9fa;
}

.map-controls button.active:hover,
.layer-options button.active:hover {
  background-color: #2980b9;
  transform: translateY(-1px);
}

.map-error-notice {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  background-color: #fff3cd;
  color: #856404;
  padding: 10px 15px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #ffeeba;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 400px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.dismiss-btn {
  background: none;
  border: none;
  color: #856404;
  cursor: pointer;
  font-size: 18px;
  padding: 0 5px;
}

.loading-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #3498db;
  animation: spin 1s linear infinite;
  margin-left: 5px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
    padding: 8px;
  }

  .map-layers-control {
    margin-top: 8px;
    padding-top: 8px;
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
