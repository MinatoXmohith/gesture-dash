import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { GestureType, VisionState } from '../types';

let handLandmarker: HandLandmarker | null = null;

// Initialize MediaPipe HandLandmarker
export const initializeVision = async (): Promise<void> => {
  if (handLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });
};

const detectGesture = (landmarks: NormalizedLandmark[]): GestureType => {
  // Simple heuristic based recognition
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];

  // Helper: Is finger extended? (Tip is higher than PIP - Y axis is inverted in vision)
  const isExtended = (tip: NormalizedLandmark, pip: NormalizedLandmark) => tip.y < pip.y;
  
  // Note: For thumb, we check X distance for "openness" roughly, or just check if it's far from palm
  // But a simple "is tip above IP" works for vertical hands.
  
  const indexOpen = isExtended(indexTip, indexPip);
  const middleOpen = isExtended(middleTip, middlePip);
  const ringOpen = isExtended(ringTip, ringPip);
  const pinkyOpen = isExtended(pinkyTip, pinkyPip);

  // Count extended non-thumb fingers
  const extendedCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

  // Thumbs Up: Thumb is up, others are closed
  if (thumbTip.y < thumbIp.y && extendedCount === 0) {
    return GestureType.THUMBS_UP;
  }

  // Open Palm: At least 3 fingers extended
  if (extendedCount >= 3) {
    return GestureType.OPEN_PALM;
  }

  // Closed Fist: 0 or 1 finger extended (allow some noise)
  if (extendedCount <= 1) {
    return GestureType.CLOSED_FIST;
  }

  return GestureType.NONE;
};

export const processVideoFrame = (video: HTMLVideoElement): VisionState => {
  if (!handLandmarker || !video.videoWidth) {
    return { handCount: 0, gesture: GestureType.NONE, isTurbo: false };
  }

  const startTimeMs = performance.now();
  const results = handLandmarker.detectForVideo(video, startTimeMs);

  const hands = results.landmarks;
  const handCount = hands.length;
  
  let primaryGesture = GestureType.NONE;

  // Prioritize gestures: If any hand shows a significant gesture, use it.
  // In a real app, might want to designate "Right Hand" vs "Left Hand", but for this game:
  // Any hand "Open" = Jump. Any hand "Fist" = Duck.
  
  for (const landmarks of hands) {
    const gesture = detectGesture(landmarks);
    if (gesture !== GestureType.NONE) {
      primaryGesture = gesture;
      // Restart (Thumbs Up) takes precedence in Game Over, but in play Jump/Duck matter most.
      // We'll let the game loop logic decide precedence, here we just return detected.
      break; 
    }
  }

  return {
    handCount,
    gesture: primaryGesture,
    isTurbo: handCount >= 2,
  };
};
