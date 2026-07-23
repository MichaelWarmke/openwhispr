// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "mlx-transcribe",
    platforms: [
        .macOS(.v14) // MLX requires macOS Sonoma or later
    ],
    dependencies: [
        .package(path: "./mlx-audio-swift"),
        .package(url: "https://github.com/ml-explore/mlx-swift.git", from: "0.10.0")
    ],
    targets: [
        .target(
            name: "MLXTranscribeCore",
            dependencies: [
                .product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
                .product(name: "MLX", package: "mlx-swift")
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        ),
        .executableTarget(
            name: "mlx-transcribe",
            dependencies: [
                "MLXTranscribeCore"
            ],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        ),
        .executableTarget(
            name: "mlx-transcribe-tests",
            dependencies: [
                "MLXTranscribeCore"
            ],
            path: "Tests/mlx-transcribe-tests-runner",
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
