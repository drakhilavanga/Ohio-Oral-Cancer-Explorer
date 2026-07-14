const DATA_URL="data/ohio_oral_cancer.geojson";
const initialView={center:[-82.8,40.25],zoom:6.35,pitch:58,bearing:-28};
const cameraViews={
  top:{center:[-82.8,40.25],zoom:6.35,pitch:0,bearing:0},
  north:{center:[-82.8,40.25],zoom:6.35,pitch:55,bearing:180},
  south:{center:[-82.8,40.25],zoom:6.35,pitch:55,bearing:0},
  east:{center:[-82.8,40.25],zoom:6.35,pitch:55,bearing:-90},
  west:{center:[-82.8,40.25],zoom:6.35,pitch:55,bearing:90},
  threeD:initialView
};
const map=new maplibregl.Map({
  container:"map",
  style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm",paint:{"raster-saturation":-.95,"raster-brightness-min":.03,"raster-brightness-max":.36,"raster-opacity":.60}}]},
  ...initialView,antialias:true,dragRotate:true,pitchWithRotate:true,minPitch:0,maxPitch:85
});
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");
map.addControl(new maplibregl.FullscreenControl(),"bottom-right");

let geojsonData=null;
let hoveredId=null;
let rotating=false,rotationFrame=null,lastRotationTime=null;
let heightScale=1;

const categoryColor=["match",["to-string",["get","rate_category"]],
  "Lowest","#ffffb2","Low","#fed976","Moderate","#feb24c","High","#fd8d3c","Highest","#bd0026","#8b8b8b"];

map.on("load",async()=>{
  const response=await fetch(DATA_URL);
  geojsonData=await response.json();

  map.addSource("counties",{type:"geojson",data:geojsonData,generateId:true});
  map.addLayer({id:"counties-3d",type:"fill-extrusion",source:"counties",paint:{
    "fill-extrusion-height":["*",["coalesce",["to-number",["get","extrusion_web"]],0],heightScale],
    "fill-extrusion-base":0,
    "fill-extrusion-color":["case",["boolean",["feature-state","hover"],false],"#ffffff",categoryColor],
    "fill-extrusion-opacity":.95,
    "fill-extrusion-vertical-gradient":true
  }});
  map.addLayer({id:"county-outline",type:"line",source:"counties",paint:{
    "line-color":["case",["boolean",["feature-state","hover"],false],"#ffffff","#141414"],
    "line-width":["case",["boolean",["feature-state","hover"],false],3,1]
  }});

  buildSummary(geojsonData.features);
});

function fmt(v){const n=Number(v);return Number.isFinite(n)?n.toFixed(1):"Unavailable"}
function updatePanel(p){
  document.getElementById("county-name").textContent=p.county_display||"County unavailable";
  document.getElementById("incidence-rate").textContent=Number.isFinite(Number(p.incidence_rate))?`${fmt(p.incidence_rate)} per 100,000`:"Unavailable";
  document.getElementById("ohio-rank").textContent=p.ohio_rank?`#${p.ohio_rank} of 88`:"Unavailable";
  document.getElementById("annual-cases").textContent=p.average_annual_count??"Unavailable";
  document.getElementById("confidence-interval").textContent=Number.isFinite(Number(p.lower_ci))&&Number.isFinite(Number(p.upper_ci))?`${fmt(p.lower_ci)}–${fmt(p.upper_ci)}`:"Unavailable";
  document.getElementById("community-type").textContent=p.rural_urban||"Unavailable";
  document.getElementById("rate-category").textContent=p.rate_category||"Unavailable";
}
function clearHover(){
  if(hoveredId===null)return;
  map.setFeatureState({source:"counties",id:hoveredId},{hover:false});
  hoveredId=null;
}
map.on("mousemove","counties-3d",e=>{
  if(!e.features?.length)return;
  stopRotation();clearHover();
  hoveredId=e.features[0].id;
  map.setFeatureState({source:"counties",id:hoveredId},{hover:true});
  map.getCanvas().style.cursor="pointer";
  updatePanel(e.features[0].properties);
});
map.on("mouseleave","counties-3d",()=>{map.getCanvas().style.cursor="";clearHover()});
map.on("click","counties-3d",e=>{
  if(!e.features?.length)return;
  const p=e.features[0].properties;updatePanel(p);
  new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
    `<strong>${p.county_display}</strong><br>Incidence: ${fmt(p.incidence_rate)} per 100,000<br>Ohio rank: ${p.ohio_rank?`#${p.ohio_rank}`:"Unavailable"}<br>Average annual cases: ${p.average_annual_count??"Unavailable"}`
  ).addTo(map);
});

document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{
  stopRotation();map.flyTo({...cameraViews[btn.dataset.view],duration:1400,essential:true});
}));

function rotationLoop(t){
  if(!rotating)return;
  if(lastRotationTime===null)lastRotationTime=t;
  const elapsed=t-lastRotationTime;lastRotationTime=t;
  map.rotateTo(map.getBearing()+6*elapsed/1000,{duration:0});
  rotationFrame=requestAnimationFrame(rotationLoop);
}
function startRotation(){if(rotating)return;rotating=true;lastRotationTime=null;map.easeTo({pitch:60,duration:700});rotationFrame=requestAnimationFrame(rotationLoop)}
function stopRotation(){rotating=false;lastRotationTime=null;if(rotationFrame!==null)cancelAnimationFrame(rotationFrame);rotationFrame=null}
document.getElementById("start-rotation").addEventListener("click",startRotation);
document.getElementById("stop-rotation").addEventListener("click",stopRotation);
document.getElementById("reset-view").addEventListener("click",()=>{stopRotation();map.flyTo({...initialView,duration:1400,essential:true})});

const slider=document.getElementById("height-scale");
slider.addEventListener("input",()=>{
  heightScale=Number(slider.value);
  document.getElementById("height-value").textContent=`${heightScale.toFixed(2)}×`;
  if(map.getLayer("counties-3d")){
    map.setPaintProperty("counties-3d","fill-extrusion-height",["*",["coalesce",["to-number",["get","extrusion_web"]],0],heightScale]);
  }
});

function buildSummary(features){
  const valid=features.filter(f=>Number.isFinite(Number(f.properties.incidence_rate)));
  valid.sort((a,b)=>Number(b.properties.incidence_rate)-Number(a.properties.incidence_rate));
  const rates=valid.map(f=>Number(f.properties.incidence_rate)).sort((a,b)=>a-b);
  const median=rates.length%2?rates[(rates.length-1)/2]:(rates[rates.length/2-1]+rates[rates.length/2])/2;

  document.getElementById("highest-county").textContent=valid[0]?.properties.county_display||"—";
  document.getElementById("highest-rate").textContent=valid[0]?`${fmt(valid[0].properties.incidence_rate)}`:"—";
  document.getElementById("median-rate").textContent=fmt(median);
  document.getElementById("county-count").textContent=features.length;

  const top=document.getElementById("top-ten");
  top.innerHTML=valid.slice(0,10).map((f,i)=>`
    <div class="top-row" data-county="${f.properties.county_display}">
      <span class="rank">${i+1}</span>
      <span>${f.properties.county_display}</span>
      <span class="rate">${fmt(f.properties.incidence_rate)}</span>
    </div>`).join("");
}

function searchCounty(){
  const query=document.getElementById("county-search").value.trim().toLowerCase();
  const message=document.getElementById("search-message");
  if(!query||!geojsonData){message.textContent="Enter a county name.";return}
  const feature=geojsonData.features.find(f=>(f.properties.county_display||"").toLowerCase().includes(query));
  if(!feature){message.textContent="County not found.";return}
  message.textContent=`Found ${feature.properties.county_display}`;
  updatePanel(feature.properties);

  const coords=feature.geometry.type==="Polygon"?feature.geometry.coordinates[0]:feature.geometry.coordinates[0][0];
  const lng=coords.reduce((s,c)=>s+c[0],0)/coords.length;
  const lat=coords.reduce((s,c)=>s+c[1],0)/coords.length;
  map.flyTo({center:[lng,lat],zoom:8,pitch:60,bearing:-20,duration:1600,essential:true});
}
document.getElementById("search-button").addEventListener("click",searchCounty);
document.getElementById("county-search").addEventListener("keydown",e=>{if(e.key==="Enter")searchCounty()});
["dragstart","zoomstart","pitchstart","rotatestart","touchstart"].forEach(ev=>map.on(ev,stopRotation));
