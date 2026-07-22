---
sessionId: session-260720-152809-11ki
---

# Requirements

### Overview
This plan outlines how to integrate the NVIDIA Parakeet 1.1B RNNT Multilingual Speech-to-Text (STT) model into the OpenWhispr application under the local models section.

The system uses `sherpa-onnx` ONNX runtimes to handle Parakeet/NVIDIA models. Integrating this model involves:
1. Registering the model's metadata in the local `parakeetModels` registry.
2. Providing a compressed tarball (`.tar.bz2`) URL containing the exported ONNX files (`encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt`).
3. Adding user-facing localization/translation strings.

---

### Scope
- **In-Scope:** Adding the `parakeet-1_1b-rnnt-multilingual-asr` model configuration to the local `parakeetModels` registry and adding its English localization.
- **Out-of-Scope:** Compiling custom `sherpa-onnx` runtimes, modifying core C++/Go bindings, or implementing a new streaming engine.

# Technical Design

### Core Files & Structures

#### 1. Model Registry Definition
All local Parakeet models are defined in the static JSON-based model registry:
- File path: `src/models/modelRegistryData.json`

To add the Parakeet 1.1B RNNT Multilingual model, append the following definition to the `"parakeetModels"` block:

```json
"parakeet-1-1b-rnnt-multilingual": {
  "name": "Parakeet RNNT 1.1B Multilingual",
  "description": "State-of-the-art multilingual RNNT model with 1.1B parameters",
  "size": "1.2GB",
  "sizeMb": 1200,
  "language": "multilingual",
  "supportedLanguages": [
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk"
  ],
  "downloadUrl": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-rnnt-1.1b-multilingual-int8.tar.bz2",
  "extractDir": "sherpa-onnx-nemo-parakeet-rnnt-1.1b-multilingual-int8",
  "descriptionKey": "models.descriptions.parakeet.parakeet_1_1b_rnnt_multilingual"
}
```

*Note: Ensure the `downloadUrl` hosts a valid `sherpa-onnx` compatible `.tar.bz2` archive containing the quantized `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt` files.*

---

#### 2. User Interface Localization
Add the translation string under the English translation assets:
- File path: `src/locales/en/translation.json`

Locate `"models.descriptions.parakeet"` and append:
```json
"parakeet_1_1b_rnnt_multilingual": "NVIDIA Parakeet 1.1B RNNT Multilingual model with high-accuracy ASR across 25 languages"
```

# Testing

### Verification Scenarios
To verify that the newly added model is fully functional:

#### 1. Typecheck and Compilation
Validate that the JSON structure matches TypeScript definitions:
```bash
npm run typecheck
```

#### 2. UI & Download Verification
- Launch the application, navigate to **Settings** -> **Transcription** (or trigger the test Onboarding wizard).
- Confirm that "Parakeet RNNT 1.1B Multilingual" is listed under local models with its translated description.
- Trigger a test download of the model and verify that the package downloads, extracts, and reports progress flawlessly.

# Delivery Steps

### x Step 1: register-parakeet-11b-in-registry
The model registry is updated to register the new Parakeet 1.1B RNNT Multilingual model. (Canceled: model removed because official download URL returns 404)

- Open `src/models/modelRegistryData.json`.
- Add the `"parakeet-1-1b-rnnt-multilingual"` object under `"parakeetModels"`.

### x Step 2: add-parakeet-11b-localization
The localization file is updated to add the English translation for the new description key. (Canceled: model removed because official download URL returns 404)

- Open `src/locales/en/translation.json`.
- Add the `"parakeet_1_1b_rnnt_multilingual"` key under `"models" -> "descriptions" -> "parakeet"`.

### x Step 3: compile-and-verify-model
Verify that everything is correct by compiling the code and checking the model selector in the UI. (Canceled: model removed because official download URL returns 404)

- Run `npm run typecheck` and `npm run build:renderer`.
- Open the application and confirm the model is visible, downlodable, and selectable.