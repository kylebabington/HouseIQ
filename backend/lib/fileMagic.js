// backend/lib/fileMagic.js
// Basic magic-byte checks so uploads are not trusted by MIME alone.

const SIGNATURES = [
    {
        mime: "application/pdf",
        bytes: [0x25, 0x50, 0x44, 0x46], // %PDF
    },
    {
        mime: "image/jpeg",
        bytes: [0xff, 0xd8, 0xff],
    },
    {
        mime: "image/png",
        bytes: [0x89, 0x50, 0x4e, 0x47],
    },
    {
        mime: "image/webp",
        // RIFF....WEBP
        test(buffer) {
            return (
                buffer.length >= 12 &&
                buffer[0] === 0x52 &&
                buffer[1] === 0x49 &&
                buffer[2] === 0x46 &&
                buffer[3] === 0x46 &&
                buffer[8] === 0x57 &&
                buffer[9] === 0x45 &&
                buffer[10] === 0x42 &&
                buffer[11] === 0x50
            );
        },
    },
];

/**
 * Returns true when the buffer matches an allowed type.
 * text/plain is accepted when content is mostly printable UTF-8.
 */
export function validateUploadMagicBytes(buffer, claimedMime) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, reason: "Empty file" };
    }

    if (claimedMime === "text/plain") {
        const sample = buffer.slice(0, 2048);
        let suspicious = 0;
        for (const byte of sample) {
            if (byte === 0) {
                suspicious += 1;
            }
        }
        if (suspicious > 0) {
            return {
                ok: false,
                reason: "Text upload contains binary null bytes",
            };
        }
        return { ok: true, detectedMime: "text/plain" };
    }

    for (const signature of SIGNATURES) {
        if (signature.test) {
            if (signature.test(buffer)) {
                return {
                    ok: true,
                    detectedMime: signature.mime,
                };
            }
            continue;
        }

        const matches = signature.bytes.every(
            (byte, index) => buffer[index] === byte
        );

        if (matches) {
            if (
                claimedMime &&
                claimedMime !== signature.mime &&
                !(
                    claimedMime === "image/jpg" &&
                    signature.mime === "image/jpeg"
                )
            ) {
                return {
                    ok: false,
                    reason: `Claimed type ${claimedMime} does not match file contents (${signature.mime})`,
                };
            }
            return {
                ok: true,
                detectedMime: signature.mime,
            };
        }
    }

    return {
        ok: false,
        reason: "Unrecognized or unsupported file type",
    };
}
