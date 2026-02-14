# PBR/IBL 현재 구현 문제 분석

**→ 아래 문제들은 수정 반영됨 (multi-sample irradiance, roughness→irradiance blend, energy conservation).**

## 이전 구현 요약 (수정 전)

- **Diffuse**: `envDiffuse = textureSample(cubemap, n)` — **법선 방향 1샘플**
- **Specular**: `envSpecular = textureSample(cubemap, reflectDir)` — **반사 방향 1샘플**
- **Roughness**: `envSpec = mix(envSpecular, envDiffuse, roughness²)` — 샤프 반사와 **같은 envDiffuse** 사이 보간
- **최종**: `finalColor = envDiffuse * ambientStrength * diffuseK + specContrib`

---

## 문제 1: "Diffuse"가 실제 디퓨즈(매트)가 아님

**현재**: 법선 방향으로 **한 번만** 샘플링  
`envDiffuse = textureSample(envCubemap, envSampler, n)`

**물리적으로**: Lambert 디퓨즈는 반구 전체에 대한 적분  
`diffuse = (albedo/π) × ∫ Li(ω) × cos(θ) dω`  
→ 여러 방향에서 오는 빛을 cos 가중으로 평균한 값이어야 함.

**결과**:  
지금은 “법선이 가리키는 한 방향”만 보는 것이라,  
- 하늘을 가리키면 하늘색, 벽을 가리키면 벽색  
- 반구 전체를 적분한 “부드러운 매트” 느낌이 아니라, **한 방향 앰비언트**에 가깝습니다.  
→ roughness를 올리고 reflection을 낮춰도 **진짜 매트한 질감**이 나오지 않는 이유 중 하나.

---

## 문제 2: Roughness가 “블러”가 아니라 “같은 디퓨즈 샘플로 교체”

**현재**:  
`envSpec = mix(envSpecular, envDiffuse, r2)`  
- roughness 0 → 반사 방향 1샘플 (샤프 반사)  
- roughness 1 → **법선 방향 1샘플 = envDiffuse와 동일**

**의도**: roughness가 크면 반사가 “뿌옇게/블러되게” 보여야 함.

**실제**:  
- 블러된 반사를 위한 **여러 샘플**이나 **pre-filtered env map**이 없음.  
- roughness를 올리면 “반사 샘플”을 **그냥 envDiffuse 한 샘플로 치환**하는 것뿐.  
- 그래서 “뿌옇게 번진 반사”가 아니라, **같은 단일 샘플**이 디퓨즈와 스펙 둘 다에 쓰이는 구조.

**결과**:  
- roughness 높임 → 스펙큘러 항이 envDiffuse와 동일해짐  
- reflection 낮춤 → 그 항의 강도만 줄어듦  
- **“거친 표면의 부드러운 반사”가 아니라, “한 방향 샘플을 두 번 쓰는 것”**이라 매트한 질감이 안 나옴.

---

## 문제 3: Roughness가 높을 때 디퓨즈와 스펙이 이중 사용됨

roughness ≈ 1 이면 `envSpec ≈ envDiffuse` 이므로:

```
finalColor = envDiffuse × ambientStrength × diffuseK
           + envDiffuse × reflectionStrength × fresnel
```

- **같은 envDiffuse**가 디퓨즈와 스펙 항에 **둘 다** 들어감.  
- 물리 BRDF에서는 디퓨즈/스펙이 서로 보완(에너지 보존)하도록 설계하는데,  
  여기서는 단일 샘플을 두 개의 독립 슬라이더로 더하는 형태라,  
  roughness를 바꿔도 “매트해지는” 느낌보다는 **같은 샘플 비율만 바뀌는** 느낌이 됨.

---

## 문제 4: Roughness에 따른 반사 블러가 없음

일반적인 PBR 파이프라인에서는:

- **Specular IBL**: roughness별로 **미리 블러된 env map** (mip level 또는 LOD) 사용  
  → roughness가 크면 더 블러된 맵을 샘플링해서 “뿌옇게 반사”를 표현.

현재:

- **원본 큐브맵 1장만** 사용,  
- roughness는 **샤프 1샘플 ↔ 법선 1샘플** 사이 **선형 보간**만 함.  
- 그래서 “거친 표면의 넓게 퍼진 반사”가 아니라,  
  “반사 방향 샘플이 점점 법선 방향 샘플로 바뀌는” 효과만 있음.  
→ 매트/러프한 느낌이 부족함.

---

## 요약: 왜 “roughness 높이고 reflection 낮춰도 매트가 안 나오는가”

1. **디퓨즈가 반구 적분이 아니라 법선 1샘플**  
   → 부드럽게 퍼진 매트 라이팅이 아니라, 한 방향만 보는 형태.

2. **Roughness가 “블러”가 아니라 “스펙 샘플을 디퓨즈 샘플로 교체”**  
   → 거친 표면의 뿌옇게 번진 반사가 아니라, 같은 단일 샘플이 디퓨즈/스펙에 중복 사용됨.

3. **Roughness 높을 때 디퓨즈와 스펙이 같은 envDiffuse 사용**  
   → 두 항이 물리적으로 분리된 디퓨즈/스펙이 아니라, 한 샘플의 비율만 바뀌어서 매트한 질감이 나오지 않음.

4. **Pre-filtered / 다중 샘플 없음**  
   → 실제 “roughness에 따른 반사 블러”나 “진짜 디퓨즈 irradiance”를 만들 수 없는 구조.

---

## 적용한 개선 사항

1. **디퓨즈 = 반구 근사 irradiance**  
   법선 방향 1샘플 대신, 10방향(6축 + 4대각)으로 큐브맵을 샘플링하고 `max(0, dot(n, dir))`로 가중 평균해 irradiance를 구함. 매트한 디퓨즈에 가깝게 동작.

2. **Roughness = 스펙큘러를 irradiance로 블렌드**  
   `envSpec = mix(envSpecular, irradiance, r2)` 로 변경. roughness가 높을 때 “한 방향 디퓨즈 샘플”이 아니라 **같은 irradiance(다중 샘플)**로 블렌드되어, 거친 반사가 부드럽게 보이도록 함.

3. **에너지 보존**  
   디퓨즈에 `kD = (1 - fresnel) * (1 - metallic)` 적용. 스펙큘러는 Fresnel 가중. grazing 각도에서 디퓨즈/스펙 이중 계산 완화.

4. **이중 계산 제거**  
   스펙 항은 `mix(sharp, irradiance, r2)` 로만 구성하고, 디퓨즈는 irradiance만 사용. 같은 단일 샘플을 두 번 쓰지 않음.

---

## 추가 개선 방향 (선택)

- **디퓨즈**:  
  - 법선 방향 1샘플 대신 **반구 여러 방향 샘플**로 irradiance 근사, 또는  
  - **미리 구어둔 디퓨즈(irradiance) 큐브맵** 사용.
- **스펙큘러**:  
  - roughness별 **pre-filtered env map** (mip 또는 LOD) 사용해서  
  - roughness가 클수록 더 블러된 맵을 샘플링.
- **에너지 보존**:  
  - 디퓨즈/스펙 비율을 Fresnel 등으로 묶어서,  
  - roughness/reflection 슬라이더가 물리적으로 타당한 범위가 되도록 설계.

이렇게 하면 “roughness 높이고 reflection 낮추면 매트해진다”는 기대에 훨씬 가깝게 동작합니다.
