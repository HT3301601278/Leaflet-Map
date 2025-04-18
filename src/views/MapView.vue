<template>
  <div class="map-page">
    <header class="map-header">
      <div class="logo">
        <img src="@/assets/map-logo.svg" alt="地图选择器" class="logo-img" />
        <h1>中国地图选择器</h1>
      </div>
      <div class="header-desc">
        <p>您可以使用区域框选、点选功能来选择感兴趣的地域</p>
      </div>
    </header>
    <ChinaMap />
  </div>
</template>

<script>
import ChinaMap from '@/components/ChinaMap.vue';

export default {
  name: 'MapView',
  components: {
    ChinaMap
  }
}
</script>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #f8f9fa;
}

.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(135deg, #3498db, #1abc9c);
  color: white;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
}

.logo-img {
  height: 36px;
  margin-right: 10px;
}

.logo h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: white;
}

.header-desc p {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.9);
}

@media (max-width: 768px) {
  .map-header {
    flex-direction: column;
    align-items: flex-start;
    padding: 10px 15px;
  }
  
  .header-desc {
    margin-top: 5px;
  }
}
</style> 