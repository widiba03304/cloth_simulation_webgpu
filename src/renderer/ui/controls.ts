/**
 * UI controls: panel with pickers and buttons. All display text via t().
 * Talks to app via callbacks only.
 */

import { t, getLocale, setLocale, loadLocale } from '../i18n';
import { SAMPLE_PATTERNS } from '../samples/patterns';
import { SAMPLE_MATERIALS } from '../samples/materials';
import type { CameraKeymap } from '../input/keymap';
import { getDefaultKeymap, formatMouseBinding, formatWheelBinding, formatKeyBinding, isDefaultKeymap } from '../input/keymap';
import type { SMPLBetas } from '../render/smplBlendShapes';
import { SMPL_SHAPE_PRESETS } from '../render/smplBlendShapes';

export interface UICallbacks {
  onPatternChange: (patternIndex: number) => void;
  onMaterialChange: (materialIndex: number) => void;
  onAvatarChange: (avatarIndex: number) => void;
  onMotionChange: (motionIndex: number) => void;
  onIterationsChange?: (iterations: number) => void;
  onSMPLBetasChange?: (betas: SMPLBetas) => void;
  onToggleIK?: (enabled: boolean) => void;
  onResetIK?: () => void;
  onCollisionParamsChange?: (friction: number, restitution: number, thickness: number) => void;
  onCubemapChange?: (cubemapName: string) => void;
  onPBRParamsChange?: (roughness: number, metallic: number, ambientStrength: number, reflectionStrength: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onLoopChange?: (loop: boolean) => void;
  onExport?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onResetKeymap?: () => void;
  /** Optional: return current keymap so panel can show bindings and refresh after reset. */
  getKeymap?: () => CameraKeymap;
}

const MOTIONS = [{ id: 'idle' }, { id: 'walk' }, { id: 'dance' }];
const AVATARS = [{ id: 'mannequin_male' }, { id: 'mannequin_female' }];

function formatBindingMouse(km: CameraKeymap, action: 'orbit' | 'pan'): string {
  const b = action === 'orbit' ? km.orbit : km.pan;
  const { modKeys, buttonKey } = formatMouseBinding(b);
  const parts = modKeys.map((k) => t(k)).concat([t(buttonKey)]);
  return parts.join('+');
}

function formatBindingWheel(km: CameraKeymap): string {
  const { modKeys } = formatWheelBinding(km.zoom);
  const parts = modKeys.map((k) => t(k));
  parts.push(t('keymap.bindingWheel'));
  return parts.join('+') || t('keymap.bindingWheel');
}

function formatBindingKey(km: CameraKeymap, action: 'rollLeft' | 'rollRight'): string {
  const b = action === 'rollLeft' ? km.rollLeft : km.rollRight;
  if (!b) return '—';
  const { modKeys, key } = formatKeyBinding(b);
  const parts = modKeys.map((k) => t(k)).concat([key]);
  return parts.join('+');
}

export function createControlsPanel(callbacks: UICallbacks): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'controls-panel';

  const sampleLabel = document.createElement('label');
  sampleLabel.textContent = t('ui.sampleGarments');
  sampleLabel.htmlFor = 'pattern-select';
  const patternSelect = document.createElement('select');
  patternSelect.id = 'pattern-select';
  patternSelect.setAttribute('aria-label', t('ui.sampleGarments'));
  SAMPLE_PATTERNS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = t(`patterns.${p.id}`);
    patternSelect.appendChild(opt);
  });
  patternSelect.addEventListener('change', () => callbacks.onPatternChange(Number(patternSelect.value)));

  const matLabel = document.createElement('label');
  matLabel.textContent = t('ui.material');
  matLabel.htmlFor = 'material-select';
  const materialSelect = document.createElement('select');
  materialSelect.id = 'material-select';
  materialSelect.setAttribute('aria-label', t('ui.material'));
  SAMPLE_MATERIALS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = t(m.presetKey);
    materialSelect.appendChild(opt);
  });
  materialSelect.addEventListener('change', () => callbacks.onMaterialChange(Number(materialSelect.value)));

  const avatarLabel = document.createElement('label');
  avatarLabel.textContent = t('ui.avatar');
  avatarLabel.htmlFor = 'avatar-select';
  const avatarSelect = document.createElement('select');
  avatarSelect.id = 'avatar-select';
  avatarSelect.setAttribute('aria-label', t('ui.avatar'));
  AVATARS.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = t(`avatars.${a.id}`);
    avatarSelect.appendChild(opt);
  });
  avatarSelect.addEventListener('change', () => callbacks.onAvatarChange(Number(avatarSelect.value)));

  const motionLabel = document.createElement('label');
  motionLabel.textContent = t('ui.motion');
  motionLabel.htmlFor = 'motion-select';
  const motionSelect = document.createElement('select');
  motionSelect.id = 'motion-select';
  motionSelect.setAttribute('aria-label', t('ui.motion'));
  MOTIONS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = t(`motions.${m.id}`);
    motionSelect.appendChild(opt);
  });
  motionSelect.addEventListener('change', () => callbacks.onMotionChange(Number(motionSelect.value)));

  const iterLabel = document.createElement('label');
  iterLabel.textContent = t('ui.iterations');
  iterLabel.htmlFor = 'iterations-input';
  const iterInput = document.createElement('input');
  iterInput.id = 'iterations-input';
  iterInput.type = 'range';
  iterInput.min = '2';
  iterInput.max = '10';
  iterInput.value = '4';
  iterInput.setAttribute('aria-label', t('ui.iterations'));
  if (callbacks.onIterationsChange) {
    iterInput.addEventListener('input', () => callbacks.onIterationsChange!(Number(iterInput.value)));
  }
  const iterValue = document.createElement('span');
  iterValue.textContent = iterInput.value;
  iterInput.addEventListener('input', () => { iterValue.textContent = iterInput.value; });
  iterLabel.appendChild(iterInput);
  iterLabel.appendChild(iterValue);

  // SMPL Betas (Shape Parameters)
  const smplBetasState: SMPLBetas = {
    beta0: 0, beta1: 0, beta2: 0, beta3: 0, beta4: 0,
    beta5: 0, beta6: 0, beta7: 0, beta8: 0, beta9: 0,
  };

  const betaSliders: HTMLElement[] = [];

  const createBetaSlider = (label: string, key: keyof SMPLBetas) => {
    const container = document.createElement('label');
    container.textContent = label;
    container.style.display = 'block';
    container.style.marginTop = '4px';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-3.0';
    slider.max = '3.0';
    slider.step = '0.1';
    slider.value = '0';
    slider.style.width = '100%';

    const value = document.createElement('span');
    value.textContent = ' 0.0';
    value.style.marginLeft = '8px';
    value.style.fontSize = '0.9em';

    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      smplBetasState[key] = val;
      value.textContent = ` ${val.toFixed(1)}`;
      if (callbacks.onSMPLBetasChange) {
        callbacks.onSMPLBetasChange(smplBetasState);
      }
    });

    container.appendChild(slider);
    container.appendChild(value);
    return container;
  };

  // Shape preset dropdown
  const shapePresetLabel = document.createElement('label');
  shapePresetLabel.textContent = 'SMPL Shape Preset:';
  shapePresetLabel.style.display = 'block';
  shapePresetLabel.style.marginTop = '8px';
  shapePresetLabel.style.fontWeight = 'bold';

  const shapePresetSelect = document.createElement('select');
  shapePresetSelect.style.width = '100%';
  shapePresetSelect.style.marginBottom = '4px';

  Object.keys(SMPL_SHAPE_PRESETS).forEach((presetName) => {
    const opt = document.createElement('option');
    opt.value = presetName;
    opt.textContent = presetName.charAt(0).toUpperCase() + presetName.slice(1);
    shapePresetSelect.appendChild(opt);
  });

  shapePresetSelect.addEventListener('change', () => {
    const preset = SMPL_SHAPE_PRESETS[shapePresetSelect.value];
    if (preset) {
      Object.assign(smplBetasState, preset);
      // Update all beta slider values
      betaSliders.forEach((slider, i) => {
        const key = `beta${i}` as keyof SMPLBetas;
        const val = preset[key];
        slider.querySelector('input')!.value = String(val);
        slider.querySelector('span')!.textContent = ` ${val.toFixed(1)}`;
      });
      if (callbacks.onSMPLBetasChange) {
        callbacks.onSMPLBetasChange(smplBetasState);
      }
    }
  });

  shapePresetLabel.appendChild(shapePresetSelect);

  // Create sliders for all 10 SMPL betas
  const betaLabels = [
    'β0: Body weight',
    'β1: Body proportions',
    'β2: Height',
    'β3: Body shape',
    'β4: Shoulder width',
    'β5: Hip width',
    'β6: Chest depth',
    'β7: Neck length',
    'β8: Arm length',
    'β9: Leg length',
  ];

  for (let i = 0; i < 10; i++) {
    const key = `beta${i}` as keyof SMPLBetas;
    const slider = createBetaSlider(betaLabels[i]!, key);
    betaSliders.push(slider);
  }

  // Cubemap selection
  const cubemapLabel = document.createElement('label');
  cubemapLabel.textContent = 'Environment';
  cubemapLabel.htmlFor = 'cubemap-select';
  cubemapLabel.style.display = 'block';
  cubemapLabel.style.marginTop = '8px';
  const cubemapSelect = document.createElement('select');
  cubemapSelect.id = 'cubemap-select';
  cubemapSelect.setAttribute('aria-label', 'Environment Cubemap');

  // List of available cubemaps (user can add more by placing folders in assets/samples/cubemaps/)
  const cubemaps = ['studio_1', 'indoor_1', 'indoor_2'];
  cubemaps.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    cubemapSelect.appendChild(opt);
  });

  if (callbacks.onCubemapChange) {
    cubemapSelect.addEventListener('change', () => callbacks.onCubemapChange!(cubemapSelect.value));
  }

  // IK Controls
  const ikLabel = document.createElement('label');
  ikLabel.className = 'ik-label';
  ikLabel.style.display = 'block';
  ikLabel.style.marginTop = '8px';
  const ikCheck = document.createElement('input');
  ikCheck.type = 'checkbox';
  ikCheck.checked = false;
  ikCheck.setAttribute('aria-label', 'Enable IK');
  const ikText = document.createTextNode(' Enable IK (Pose Control)');
  ikLabel.appendChild(ikCheck);
  ikLabel.appendChild(ikText);
  ikCheck.addEventListener('change', () => callbacks.onToggleIK?.(ikCheck.checked));

  const ikResetBtn = document.createElement('button');
  ikResetBtn.type = 'button';
  ikResetBtn.textContent = 'Reset IK Pose';
  ikResetBtn.style.marginTop = '4px';
  ikResetBtn.style.fontSize = '12px';
  ikResetBtn.addEventListener('click', () => callbacks.onResetIK?.());

  // Body Collision Controls
  const collisionSection = document.createElement('div');
  collisionSection.className = 'collision-section';
  collisionSection.style.marginTop = '12px';
  collisionSection.style.padding = '8px';
  collisionSection.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
  collisionSection.style.borderRadius = '4px';

  const collisionTitle = document.createElement('div');
  collisionTitle.textContent = 'Body Collision';
  collisionTitle.style.fontWeight = 'bold';
  collisionTitle.style.marginBottom = '8px';
  collisionSection.appendChild(collisionTitle);

  // Friction slider
  const frictionLabel = document.createElement('label');
  frictionLabel.textContent = 'Friction';
  frictionLabel.style.display = 'block';
  frictionLabel.style.marginTop = '4px';
  const frictionSlider = document.createElement('input');
  frictionSlider.type = 'range';
  frictionSlider.min = '0.0';
  frictionSlider.max = '0.9';
  frictionSlider.step = '0.05';
  frictionSlider.value = '0.3';
  frictionSlider.style.width = '100%';
  const frictionValue = document.createElement('span');
  frictionValue.textContent = ' 0.3';
  frictionValue.style.marginLeft = '8px';
  frictionValue.style.fontSize = '0.9em';

  // Restitution slider
  const restitutionLabel = document.createElement('label');
  restitutionLabel.textContent = 'Restitution';
  restitutionLabel.style.display = 'block';
  restitutionLabel.style.marginTop = '4px';
  const restitutionSlider = document.createElement('input');
  restitutionSlider.type = 'range';
  restitutionSlider.min = '0.0';
  restitutionSlider.max = '0.3';
  restitutionSlider.step = '0.05';
  restitutionSlider.value = '0.0';
  restitutionSlider.style.width = '100%';
  const restitutionValue = document.createElement('span');
  restitutionValue.textContent = ' 0.0';
  restitutionValue.style.marginLeft = '8px';
  restitutionValue.style.fontSize = '0.9em';

  // Thickness slider
  const thicknessLabel = document.createElement('label');
  thicknessLabel.textContent = 'Thickness';
  thicknessLabel.style.display = 'block';
  thicknessLabel.style.marginTop = '4px';
  const thicknessSlider = document.createElement('input');
  thicknessSlider.type = 'range';
  thicknessSlider.min = '0.005';
  thicknessSlider.max = '0.05';
  thicknessSlider.step = '0.005';
  thicknessSlider.value = '0.01';
  thicknessSlider.style.width = '100%';
  const thicknessValue = document.createElement('span');
  thicknessValue.textContent = ' 0.010';
  thicknessValue.style.marginLeft = '8px';
  thicknessValue.style.fontSize = '0.9em';

  // Update function for collision params
  const updateCollisionParams = () => {
    if (callbacks.onCollisionParamsChange) {
      callbacks.onCollisionParamsChange(
        Number(frictionSlider.value),
        Number(restitutionSlider.value),
        Number(thicknessSlider.value)
      );
    }
  };

  frictionSlider.addEventListener('input', () => {
    frictionValue.textContent = ` ${Number(frictionSlider.value).toFixed(2)}`;
    updateCollisionParams();
  });

  restitutionSlider.addEventListener('input', () => {
    restitutionValue.textContent = ` ${Number(restitutionSlider.value).toFixed(2)}`;
    updateCollisionParams();
  });

  thicknessSlider.addEventListener('input', () => {
    thicknessValue.textContent = ` ${Number(thicknessSlider.value).toFixed(3)}`;
    updateCollisionParams();
  });

  frictionLabel.appendChild(frictionSlider);
  frictionLabel.appendChild(frictionValue);
  restitutionLabel.appendChild(restitutionSlider);
  restitutionLabel.appendChild(restitutionValue);
  thicknessLabel.appendChild(thicknessSlider);
  thicknessLabel.appendChild(thicknessValue);

  collisionSection.appendChild(frictionLabel);
  collisionSection.appendChild(restitutionLabel);
  collisionSection.appendChild(thicknessLabel);

  // PBR / IBL Controls
  const pbrSection = document.createElement('div');
  pbrSection.className = 'pbr-section';
  pbrSection.style.marginTop = '12px';
  pbrSection.style.padding = '8px';
  pbrSection.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
  pbrSection.style.borderRadius = '4px';

  const pbrTitle = document.createElement('div');
  pbrTitle.textContent = 'PBR / IBL';
  pbrTitle.style.fontWeight = 'bold';
  pbrTitle.style.marginBottom = '8px';
  pbrSection.appendChild(pbrTitle);

  // Roughness slider
  const roughnessLabel = document.createElement('label');
  roughnessLabel.textContent = 'Roughness';
  roughnessLabel.style.display = 'block';
  roughnessLabel.style.marginTop = '4px';
  const roughnessSlider = document.createElement('input');
  roughnessSlider.type = 'range';
  roughnessSlider.min = '0.0';
  roughnessSlider.max = '1.0';
  roughnessSlider.step = '0.05';
  roughnessSlider.value = '0.5';
  roughnessSlider.style.width = '100%';
  const roughnessValue = document.createElement('span');
  roughnessValue.textContent = ' 0.50';
  roughnessValue.style.marginLeft = '8px';
  roughnessValue.style.fontSize = '0.9em';

  // Metallic slider
  const metallicLabel = document.createElement('label');
  metallicLabel.textContent = 'Metallic';
  metallicLabel.style.display = 'block';
  metallicLabel.style.marginTop = '4px';
  const metallicSlider = document.createElement('input');
  metallicSlider.type = 'range';
  metallicSlider.min = '0.0';
  metallicSlider.max = '1.0';
  metallicSlider.step = '0.05';
  metallicSlider.value = '0.1';
  metallicSlider.style.width = '100%';
  const metallicValue = document.createElement('span');
  metallicValue.textContent = ' 0.10';
  metallicValue.style.marginLeft = '8px';
  metallicValue.style.fontSize = '0.9em';

  // Ambient strength slider
  const ambientLabel = document.createElement('label');
  ambientLabel.textContent = 'Ambient';
  ambientLabel.style.display = 'block';
  ambientLabel.style.marginTop = '4px';
  const ambientSlider = document.createElement('input');
  ambientSlider.type = 'range';
  ambientSlider.min = '0.0';
  ambientSlider.max = '1.0';
  ambientSlider.step = '0.05';
  ambientSlider.value = '0.5';
  ambientSlider.style.width = '100%';
  const ambientValue = document.createElement('span');
  ambientValue.textContent = ' 0.50';
  ambientValue.style.marginLeft = '8px';
  ambientValue.style.fontSize = '0.9em';

  // Reflection strength slider
  const reflectionLabel = document.createElement('label');
  reflectionLabel.textContent = 'Reflection';
  reflectionLabel.style.display = 'block';
  reflectionLabel.style.marginTop = '4px';
  const reflectionSlider = document.createElement('input');
  reflectionSlider.type = 'range';
  reflectionSlider.min = '0.0';
  reflectionSlider.max = '1.0';
  reflectionSlider.step = '0.05';
  reflectionSlider.value = '0.22';
  reflectionSlider.style.width = '100%';
  const reflectionValue = document.createElement('span');
  reflectionValue.textContent = ' 0.22';
  reflectionValue.style.marginLeft = '8px';
  reflectionValue.style.fontSize = '0.9em';

  // Update function for PBR params
  const updatePBRParams = () => {
    if (callbacks.onPBRParamsChange) {
      callbacks.onPBRParamsChange(
        Number(roughnessSlider.value),
        Number(metallicSlider.value),
        Number(ambientSlider.value),
        Number(reflectionSlider.value)
      );
    }
  };

  roughnessSlider.addEventListener('input', () => {
    roughnessValue.textContent = ` ${Number(roughnessSlider.value).toFixed(2)}`;
    updatePBRParams();
  });

  metallicSlider.addEventListener('input', () => {
    metallicValue.textContent = ` ${Number(metallicSlider.value).toFixed(2)}`;
    updatePBRParams();
  });

  ambientSlider.addEventListener('input', () => {
    ambientValue.textContent = ` ${Number(ambientSlider.value).toFixed(2)}`;
    updatePBRParams();
  });

  reflectionSlider.addEventListener('input', () => {
    reflectionValue.textContent = ` ${Number(reflectionSlider.value).toFixed(2)}`;
    updatePBRParams();
  });

  roughnessLabel.appendChild(roughnessSlider);
  roughnessLabel.appendChild(roughnessValue);
  metallicLabel.appendChild(metallicSlider);
  metallicLabel.appendChild(metallicValue);
  ambientLabel.appendChild(ambientSlider);
  ambientLabel.appendChild(ambientValue);
  reflectionLabel.appendChild(reflectionSlider);
  reflectionLabel.appendChild(reflectionValue);

  pbrSection.appendChild(roughnessLabel);
  pbrSection.appendChild(metallicLabel);
  pbrSection.appendChild(ambientLabel);
  pbrSection.appendChild(reflectionLabel);

  const playPauseBtn = document.createElement('button');
  playPauseBtn.type = 'button';
  playPauseBtn.setAttribute('aria-label', t('ui.play'));
  let isPlaying = true;
  function updatePlayPauseLabel(): void {
    playPauseBtn.textContent = isPlaying ? t('ui.pause') : t('ui.play');
  }
  updatePlayPauseLabel();
  playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    updatePlayPauseLabel();
    callbacks.onPlayPause();
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = t('ui.reset');
  resetBtn.setAttribute('aria-label', t('ui.reset'));
  resetBtn.addEventListener('click', () => callbacks.onReset());

  const keymapSection = document.createElement('div');
  keymapSection.className = 'keymap-section';
  keymapSection.style.marginTop = '8px';
  keymapSection.style.fontSize = '11px';
  const keymapTitle = document.createElement('div');
  keymapTitle.style.fontWeight = '600';
  keymapTitle.style.marginBottom = '4px';
  keymapTitle.textContent = t('keymap.settings');
  keymapSection.appendChild(keymapTitle);
  const keymapPresetWrap = document.createElement('div');
  keymapPresetWrap.style.marginBottom = '6px';
  const keymapPresetLabel = document.createElement('label');
  keymapPresetLabel.textContent = t('keymap.preset') + ' ';
  keymapPresetLabel.htmlFor = 'keymap-preset';
  const keymapPresetSelect = document.createElement('select');
  keymapPresetSelect.id = 'keymap-preset';
  keymapPresetSelect.setAttribute('aria-label', t('keymap.preset'));
  const optBlender = document.createElement('option');
  optBlender.value = 'blender';
  optBlender.textContent = t('keymap.blender');
  const optCustom = document.createElement('option');
  optCustom.value = 'custom';
  optCustom.textContent = t('keymap.custom');
  keymapPresetSelect.appendChild(optBlender);
  keymapPresetSelect.appendChild(optCustom);
  keymapPresetWrap.appendChild(keymapPresetLabel);
  keymapPresetWrap.appendChild(keymapPresetSelect);
  keymapSection.appendChild(keymapPresetWrap);
  keymapPresetSelect.addEventListener('change', () => {
    if (keymapPresetSelect.value === 'blender' && callbacks.onResetKeymap) {
      callbacks.onResetKeymap();
      updateKeymapSectionBindings();
    }
  });
  const keymapRows: { action: string; labelKey: string; labelEl: HTMLElement; bindingEl: HTMLElement }[] = [];
  for (const [actionKey, labelKey] of [
    ['orbit', 'keymap.orbit'],
    ['pan', 'keymap.pan'],
    ['zoom', 'keymap.zoom'],
    ['rollLeft', 'keymap.rollLeft'],
    ['rollRight', 'keymap.rollRight'],
  ] as const) {
    const row = document.createElement('div');
    row.className = 'keymap-row';
    row.setAttribute('data-action', actionKey);
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';
    row.style.marginBottom = '2px';
    const labelEl = document.createElement('span');
    labelEl.textContent = t(labelKey);
    const bindingEl = document.createElement('span');
    bindingEl.style.color = '#888';
    row.appendChild(labelEl);
    row.appendChild(bindingEl);
    keymapSection.appendChild(row);
    keymapRows.push({ action: actionKey, labelKey, labelEl, bindingEl });
  }
  function updateKeymapSectionBindings(): void {
    const km = callbacks.getKeymap?.() ?? getDefaultKeymap();
    if (callbacks.getKeymap) {
      keymapPresetSelect.value = isDefaultKeymap(km) ? 'blender' : 'custom';
    }
    keymapRows.forEach(({ action, labelKey, labelEl, bindingEl }) => {
      labelEl.textContent = t(labelKey);
      if (action === 'orbit') bindingEl.textContent = formatBindingMouse(km, 'orbit');
      else if (action === 'pan') bindingEl.textContent = formatBindingMouse(km, 'pan');
      else if (action === 'zoom') bindingEl.textContent = formatBindingWheel(km);
      else if (action === 'rollLeft') bindingEl.textContent = formatBindingKey(km, 'rollLeft');
      else bindingEl.textContent = formatBindingKey(km, 'rollRight');
    });
  }
  updateKeymapSectionBindings();

  const loopLabel = document.createElement('label');
  loopLabel.className = 'loop-label';
  const loopCheck = document.createElement('input');
  loopCheck.type = 'checkbox';
  loopCheck.checked = true;
  loopCheck.setAttribute('aria-label', t('ui.loop'));
  const loopText = document.createTextNode(' ' + t('ui.loop'));
  loopLabel.appendChild(loopCheck);
  loopLabel.appendChild(loopText);
  loopCheck.addEventListener('change', () => callbacks.onLoopChange?.(loopCheck.checked));

  const langLabel = document.createElement('label');
  langLabel.textContent = t('ui.language');
  langLabel.htmlFor = 'lang-select';
  const langSelect = document.createElement('select');
  langSelect.id = 'lang-select';
  langSelect.setAttribute('aria-label', t('ui.language'));
  const enOpt = document.createElement('option');
  enOpt.value = 'en';
  enOpt.textContent = 'English';
  const koOpt = document.createElement('option');
  koOpt.value = 'ko';
  koOpt.textContent = '한국어';
  langSelect.appendChild(enOpt);
  langSelect.appendChild(koOpt);
  langSelect.value = getLocale();
  langSelect.addEventListener('change', async () => {
    await loadLocale(langSelect.value);
    setLocale(langSelect.value);
    refreshPanelLabels(panel, callbacks, updatePlayPauseLabel);
  });

  const statsDiv = document.createElement('div');
  statsDiv.className = 'stats';

  panel.appendChild(sampleLabel);
  panel.appendChild(patternSelect);
  panel.appendChild(matLabel);
  panel.appendChild(materialSelect);
  panel.appendChild(avatarLabel);
  panel.appendChild(avatarSelect);
  panel.appendChild(motionLabel);
  panel.appendChild(motionSelect);
  if (callbacks.onIterationsChange) {
    panel.appendChild(iterLabel);
  }
  if (callbacks.onSMPLBetasChange) {
    panel.appendChild(shapePresetLabel);
    betaSliders.forEach(slider => panel.appendChild(slider));
  }
  if (callbacks.onCubemapChange) {
    panel.appendChild(cubemapLabel);
    panel.appendChild(cubemapSelect);
  }
  if (callbacks.onToggleIK) {
    panel.appendChild(ikLabel);
  }
  if (callbacks.onResetIK) {
    panel.appendChild(ikResetBtn);
  }
  if (callbacks.onCollisionParamsChange) {
    panel.appendChild(collisionSection);
  }
  if (callbacks.onPBRParamsChange) {
    panel.appendChild(pbrSection);
  }
  panel.appendChild(playPauseBtn);
  panel.appendChild(resetBtn);
  if (callbacks.onResetKeymap) {
    const keymapResetBtn = document.createElement('button');
    keymapResetBtn.type = 'button';
    keymapResetBtn.textContent = t('keymap.resetToDefault');
    keymapResetBtn.setAttribute('aria-label', t('keymap.resetToDefault'));
    keymapResetBtn.style.marginTop = '4px';
    keymapResetBtn.addEventListener('click', () => {
      callbacks.onResetKeymap!();
      updateKeymapSectionBindings();
    });
    keymapSection.appendChild(keymapResetBtn);
  }
  panel.appendChild(keymapSection);
  if (callbacks.onLoopChange) {
    panel.appendChild(loopLabel);
  }
  if (callbacks.onExport) {
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = t('ui.export');
    exportBtn.setAttribute('aria-label', t('ui.export'));
    exportBtn.addEventListener('click', () => callbacks.onExport!());
    panel.appendChild(exportBtn);
  }
  if (callbacks.onOpenProject) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = t('ui.open');
    openBtn.setAttribute('aria-label', t('ui.open'));
    openBtn.addEventListener('click', () => callbacks.onOpenProject!());
    panel.appendChild(openBtn);
  }
  if (callbacks.onSaveProject) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = t('ui.save');
    saveBtn.setAttribute('aria-label', t('ui.save'));
    saveBtn.addEventListener('click', () => callbacks.onSaveProject!());
    panel.appendChild(saveBtn);
  }
  panel.appendChild(langLabel);
  panel.appendChild(langSelect);
  panel.appendChild(statsDiv);

  (panel as HTMLElement & { setStats: (fps: number, particles: number) => void }).setStats = (
    fps: number,
    particles: number
  ) => {
    statsDiv.textContent = `${t('ui.fps')}: ${fps.toFixed(0)}  ${t('ui.particles')}: ${particles}`;
  };

  const panelWithKeymap = panel as HTMLElement & { refreshKeymapSection?: () => void };
  panelWithKeymap.refreshKeymapSection = () => {
    keymapTitle.textContent = t('keymap.settings');
    keymapPresetLabel.textContent = t('keymap.preset') + ' ';
    keymapPresetSelect.querySelectorAll('option').forEach((opt, i) => {
      opt.textContent = i === 0 ? t('keymap.blender') : t('keymap.custom');
    });
    updateKeymapSectionBindings();
    const resetBtn = keymapSection.querySelector('button');
    if (resetBtn) resetBtn.textContent = t('keymap.resetToDefault');
  };

  // Create toggle button for showing/hiding the panel
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toggle-panel-btn panel-visible';
  toggleBtn.textContent = '◀ Hide';
  toggleBtn.type = 'button';

  let panelVisible = true;
  toggleBtn.addEventListener('click', () => {
    panelVisible = !panelVisible;
    if (panelVisible) {
      panel.classList.remove('collapsed');
      toggleBtn.classList.add('panel-visible');
      toggleBtn.textContent = '◀ Hide';
    } else {
      panel.classList.add('collapsed');
      toggleBtn.classList.remove('panel-visible');
      toggleBtn.textContent = '▶ Show';
    }
  });

  // Attach toggle button to the same parent as panel
  (panel as HTMLElement & { toggleButton: HTMLElement }).toggleButton = toggleBtn;

  return panel;
}

function refreshPanelLabels(
  panel: HTMLElement,
  callbacks: UICallbacks,
  updatePlayPauseLabel: () => void
): void {
  const labels = panel.querySelectorAll('label');
  const patternSelect = panel.querySelector('#pattern-select') as HTMLSelectElement;
  const materialSelect = panel.querySelector('#material-select') as HTMLSelectElement;
  const avatarSelect = panel.querySelector('#avatar-select') as HTMLSelectElement;
  const motionSelect = panel.querySelector('#motion-select') as HTMLSelectElement;
  if (labels[0]) labels[0].textContent = t('ui.sampleGarments');
  if (labels[1]) labels[1].textContent = t('ui.material');
  if (labels[2]) labels[2].textContent = t('ui.avatar');
  if (labels[3]) labels[3].textContent = t('ui.motion');
  if (labels[4]) labels[4].textContent = t('ui.language');
  SAMPLE_PATTERNS.forEach((p, i) => {
    const opt = patternSelect?.options[i];
    if (opt) opt.textContent = t(`patterns.${p.id}`);
  });
  SAMPLE_MATERIALS.forEach((m, i) => {
    const opt = materialSelect?.options[i];
    if (opt) opt.textContent = t(m.presetKey);
  });
  AVATARS.forEach((a, i) => {
    const opt = avatarSelect?.options[i];
    if (opt) opt.textContent = t(`avatars.${a.id}`);
  });
  MOTIONS.forEach((m, i) => {
    const opt = motionSelect?.options[i];
    if (opt) opt.textContent = t(`motions.${m.id}`);
  });
  updatePlayPauseLabel();
  const buttons = panel.querySelectorAll('button');
  if (buttons[1]) buttons[1].textContent = t('ui.reset');
  const loopLabelEl = panel.querySelector('.loop-label');
  if (loopLabelEl && loopLabelEl.childNodes.length > 1) {
    loopLabelEl.childNodes[1].textContent = ' ' + t('ui.loop');
  }
  if (callbacks.onExport && buttons[2]) buttons[2].textContent = t('ui.export');
  (panel as HTMLElement & { refreshKeymapSection?: () => void }).refreshKeymapSection?.();
}
