import { HelmetOptions } from 'helmet'

export function getHelmetConfig(isProd: boolean): HelmetOptions {
    return {
        contentSecurityPolicy: isProd
            ? {
                  useDefaults: true,
                  directives: {
                      defaultSrc: ["'none'"], // API không cần load resource

                      connectSrc: ["'self'"], // chỉ cho phép gọi chính nó

                      imgSrc: ["'self'", 'data:'], // nếu có trả ảnh base64

                      styleSrc: ["'self'"],
                      scriptSrc: ["'self'"],

                      objectSrc: ["'none'"],
                      frameSrc: ["'none'"],

                      // ép HTTPS (prod only)
                      upgradeInsecureRequests: []
                  }
              }
            : false,

        // 🔒 Chống clickjacking
        frameguard: {
            action: 'deny'
        },

        // 🔒 Ẩn header X-Powered-By
        hidePoweredBy: true,

        // 🔒 Chống MIME sniff
        noSniff: true,

        // 🔒 HSTS chỉ bật ở production
        hsts: isProd
            ? {
                  maxAge: 31536000,
                  includeSubDomains: true,
                  preload: true
              }
            : false,

        // Referrer policy
        referrerPolicy: {
            policy: 'no-referrer'
        },

        // COOP / CORP (isolate process - optional nhưng nên bật prod)
        crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false,
        crossOriginResourcePolicy: isProd ? { policy: 'same-origin' } : false
    }
}
