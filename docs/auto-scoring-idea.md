# Auto Scoring via Computer Vision — Idea Doc

## Concept
Stream match video through a camera, use computer vision to detect umpire signals and automatically feed scoring events into Firestore.

## Problem Breakdown

### 1. Umpire Signal Detection (start here)
- Most tractable — standardized gestures, stationary subject
- Signals to detect: four, six, out, wide, no-ball, dead ball, leg bye, bye
- **Tech:** MediaPipe Pose (free, no GPU) extracts body keypoints from video frames
- **Classifier:** map arm/hand angles to signal type (even a decision tree works)

### 2. Run Counting (harder, defer)
- Requires tracking two runners across the pitch
- Lots of occlusion, variable camera angles
- Defer to Phase 2 — use umpire signals as source of truth for now

### 3. Player Recognition (hardest, defer)
- Identify batter/bowler from video
- For prototype: scorer manually sets who's batting/bowling, vision handles events

## Prototype Tech Stack
- **MediaPipe Pose** — real-time body keypoint detection from video stream
- **Python + OpenCV** — frame processing pipeline
- **scikit-learn** — small classifier (SVM or decision tree) on keypoint features
- **Firebase Admin SDK** — push scoring events to existing Firestore

## Prototype Steps
1. Record 20-30 clips of umpire signals from matches
2. Run MediaPipe Pose to extract arm angle keypoints per frame
3. Label clips with signal type, train classifier
4. Build Python script: video stream → pose detection → signal classification → Firestore write
5. Manual fallback: scorer confirms ambiguous detections before they're committed

## Open Questions
- Camera placement (fixed behind bowler's end? side-on?)
- Latency requirement — real-time or post-over?
- Integration with existing CricClubs scoring or replace it entirely?
- How to handle multiple matches running simultaneously
