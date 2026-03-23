use std::collections::HashMap;
use std::sync::LazyLock;

/// Fixed rate: 1 USD = 7 CNY (display).
/// Model list prices change quarterly; fixed FX is enough for estimates.
/// Updated 2026-03-09; next review 2026-06-09.
pub const USD_TO_CNY: f64 = 7.0;

/// Model pricing (USD per 1M tokens).
#[derive(Debug, Clone)]
pub struct ModelPricing {
    pub input: f64,       // USD per 1M input tokens
    pub output: f64,      // USD per 1M output tokens
    pub cache_read: f64,  // USD per 1M cache read tokens
    pub cache_write: f64, // USD per 1M cache write tokens
}

impl ModelPricing {
    pub fn new(input: f64, output: f64) -> Self {
        Self {
            input,
            output,
            cache_read: 0.0,
            cache_write: 0.0,
        }
    }

    pub fn with_cache(input: f64, output: f64, cache_read: f64, cache_write: f64) -> Self {
        Self {
            input,
            output,
            cache_read,
            cache_write,
        }
    }

    /// Total cost in USD.
    pub fn calculate_cost(
        &self,
        input_tokens: u64,
        output_tokens: u64,
        cache_read_tokens: u64,
        cache_write_tokens: u64,
    ) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output;
        let cache_read_cost = (cache_read_tokens as f64 / 1_000_000.0) * self.cache_read;
        let cache_write_cost = (cache_write_tokens as f64 / 1_000_000.0) * self.cache_write;

        input_cost + output_cost + cache_read_cost + cache_write_cost
    }
}

/// Global model pricing table.
/// Keys: "provider:modelId" or bare "modelId" for generic lookup.
pub static MODEL_PRICING_DB: LazyLock<HashMap<String, ModelPricing>> = LazyLock::new(|| {
    let mut db = HashMap::new();

    // ===== OpenAI =====
    db.insert("openai:gpt-5.4".to_string(), ModelPricing::with_cache(2.5, 15.0, 0.25, 0.0));
    db.insert("openai:gpt-5.4-pro".to_string(), ModelPricing::new(30.0, 180.0));
    db.insert("openai:gpt-5.3-chat".to_string(), ModelPricing::new(1.5, 10.0));
    db.insert("openai:gpt-5.2".to_string(), ModelPricing::new(1.2, 8.0));
    db.insert("openai:gpt-5-mini".to_string(), ModelPricing::with_cache(0.25, 2.0, 0.025, 0.0));
    db.insert("openai:gpt-4.1-nano".to_string(), ModelPricing::new(0.15, 1.5));
    db.insert("openai:o4-mini-deep-research".to_string(), ModelPricing::new(1.0, 8.0));
    db.insert("openai:o3-deep-research".to_string(), ModelPricing::new(2.0, 12.0));
    db.insert("openai:o1-pro".to_string(), ModelPricing::new(15.0, 60.0));
    db.insert("openai:o1".to_string(), ModelPricing::new(15.0, 60.0));
    db.insert("openai:o1-mini".to_string(), ModelPricing::new(3.0, 12.0));
    db.insert("openai:gpt-4o".to_string(), ModelPricing::with_cache(2.5, 10.0, 1.25, 0.0));
    db.insert("openai:gpt-4o-mini".to_string(), ModelPricing::with_cache(0.15, 0.6, 0.075, 0.0));
    db.insert("openai:gpt-4-turbo".to_string(), ModelPricing::new(10.0, 30.0));

    // ===== Anthropic =====
    db.insert("anthropic:claude-opus-4".to_string(), ModelPricing::with_cache(15.0, 75.0, 1.5, 18.75));
    db.insert("anthropic:claude-sonnet-4".to_string(), ModelPricing::with_cache(3.0, 15.0, 0.3, 3.75));
    db.insert("anthropic:claude-sonnet-3-7".to_string(), ModelPricing::with_cache(3.0, 15.0, 0.3, 3.75));
    db.insert("anthropic:claude-sonnet-3-5".to_string(), ModelPricing::with_cache(3.0, 15.0, 0.3, 3.75));
    db.insert("anthropic:claude-haiku-3-5".to_string(), ModelPricing::with_cache(0.8, 4.0, 0.08, 1.0));
    db.insert("anthropic:claude-opus-3".to_string(), ModelPricing::with_cache(15.0, 75.0, 1.5, 18.75));

    // ===== Google =====
    db.insert("google:gemini-2.5-pro".to_string(), ModelPricing::with_cache(1.25, 5.0, 0.31, 1.25));
    db.insert("google:gemini-2.5-flash".to_string(), ModelPricing::with_cache(0.15, 0.6, 0.04, 0.15));
    db.insert("google:gemini-2.0-flash-thinking".to_string(), ModelPricing::new(0.0, 0.0)); // free tier
    db.insert("google:gemini-1.5-pro".to_string(), ModelPricing::with_cache(1.25, 5.0, 0.31, 1.25));
    db.insert("google:gemini-1.5-flash".to_string(), ModelPricing::with_cache(0.075, 0.3, 0.02, 0.075));
    db.insert("google:gemini-exp-1206".to_string(), ModelPricing::new(0.0, 0.0)); // free tier

    // ===== Zhipu =====
    db.insert("zhipu:glm-5".to_string(), ModelPricing::new(1.0, 3.2));
    db.insert("zhipu:glm-5-plus".to_string(), ModelPricing::new(1.43, 5.71));
    db.insert("zhipu:glm-5-air".to_string(), ModelPricing::new(0.14, 0.57));
    db.insert("zhipu:glm-4-plus".to_string(), ModelPricing::new(7.14, 7.14));
    db.insert("zhipu:glm-4-air".to_string(), ModelPricing::new(0.14, 0.14));
    db.insert("zhipu:glm-4-flash".to_string(), ModelPricing::new(0.014, 0.014));

    // ===== Bailian (DashScope) =====
    db.insert("bailian:qwen-max".to_string(), ModelPricing::with_cache(0.343, 1.371, 0.034, 0.0));
    db.insert("bailian:qwen-plus".to_string(), ModelPricing::with_cache(0.217, 0.543, 0.022, 0.0));
    db.insert("bailian:qwen-turbo".to_string(), ModelPricing::with_cache(0.043, 0.086, 0.004, 0.0));
    db.insert("bailian:qwen-2.5-turbo-1m".to_string(), ModelPricing::new(0.043, 0.086));
    db.insert("bailian:qwen-long".to_string(), ModelPricing::new(0.071, 0.143));
    db.insert("bailian:qwen-omni".to_string(), ModelPricing::new(0.143, 0.429));
    db.insert("bailian:qwen-plus-r".to_string(), ModelPricing::new(0.514, 1.543));
    db.insert("bailian:qwen-vl-max".to_string(), ModelPricing::new(0.057, 0.143));
    db.insert("bailian:qwen-vl-plus".to_string(), ModelPricing::new(0.057, 0.143));
    db.insert("bailian:qwen-vl-turbo".to_string(), ModelPricing::new(0.029, 0.057));
    db.insert("bailian:qwen2.5-72b-instruct".to_string(), ModelPricing::new(0.057, 0.171));
    db.insert("bailian:qwen2.5-32b-instruct".to_string(), ModelPricing::new(0.029, 0.086));
    db.insert("bailian:qwen2.5-14b-instruct".to_string(), ModelPricing::new(0.014, 0.043));
    db.insert("bailian:qwen2.5-7b-instruct".to_string(), ModelPricing::new(0.007, 0.021));
    db.insert("bailian:qwen2.5-coder-32b-instruct".to_string(), ModelPricing::new(0.029, 0.086));
    db.insert("bailian:qwq-32b-preview".to_string(), ModelPricing::new(0.286, 0.857));
    db.insert("bailian:deepseek-v3".to_string(), ModelPricing::with_cache(0.286, 0.429, 0.029, 0.0));
    db.insert("bailian:deepseek-v3-exp".to_string(), ModelPricing::new(0.286, 0.429));
    db.insert("bailian:deepseek-v3.1".to_string(), ModelPricing::new(0.571, 1.714));
    db.insert("bailian:deepseek-v3-0116".to_string(), ModelPricing::new(0.286, 1.143));
    db.insert("bailian:deepseek-r1".to_string(), ModelPricing::new(0.571, 2.286));
    db.insert("bailian:deepseek-r1-0118".to_string(), ModelPricing::new(0.571, 2.286));
    db.insert("bailian:deepseek-r1-distill-qwen-32b".to_string(), ModelPricing::new(0.286, 0.857));
    db.insert("bailian:deepseek-r1-distill-qwen-14b".to_string(), ModelPricing::new(0.143, 0.429));
    db.insert("bailian:deepseek-r1-distill-qwen-7b".to_string(), ModelPricing::new(0.071, 0.143));
    db.insert("bailian:siliconflow-deepseek-v3.2".to_string(), ModelPricing::new(0.286, 0.429));
    db.insert("bailian:siliconflow-deepseek-v3.1-ultimate".to_string(), ModelPricing::new(0.571, 1.714));
    db.insert("bailian:siliconflow-deepseek-r1".to_string(), ModelPricing::new(0.571, 2.286));
    db.insert("bailian:siliconflow-deepseek-v3-0116".to_string(), ModelPricing::new(0.286, 1.143));
    db.insert("bailian:bailian/kimi-k2.5".to_string(), ModelPricing::new(0.571, 3.0));
    db.insert("bailian:bailian/glm-5".to_string(), ModelPricing::new(1.0, 3.2));
    db.insert("bailian:bailian/glm-5-plus".to_string(), ModelPricing::new(1.43, 5.71));
    // Bailian OpenAI-compat API uses official names MiniMax-M2.5 / MiniMax-M2.1
    db.insert("bailian:MiniMax-M2.5".to_string(), ModelPricing::new(0.3, 1.2));
    db.insert("bailian:MiniMax-M2.1".to_string(), ModelPricing::new(0.3, 1.2));
    db.insert("bailian:minimax-m2.5".to_string(), ModelPricing::new(0.3, 1.2));
    db.insert("bailian:minimax-m2.1".to_string(), ModelPricing::new(0.3, 1.2));

    // ===== Moonshot (Kimi) =====
    db.insert("moonshot:kimi-k2.5".to_string(), ModelPricing::new(4.0, 21.0));
    db.insert("moonshot:kimi-k1.5".to_string(), ModelPricing::new(0.5, 2.0));
    db.insert("moonshot:moonshot-v1-128k".to_string(), ModelPricing::new(0.71, 0.71));
    db.insert("moonshot:moonshot-v1-32k".to_string(), ModelPricing::new(0.36, 0.36));

    // ===== DeepSeek =====
    db.insert("deepseek:deepseek-chat".to_string(), ModelPricing::with_cache(0.27, 1.1, 0.014, 0.0));
    db.insert("deepseek:deepseek-reasoner".to_string(), ModelPricing::with_cache(0.55, 2.19, 0.014, 0.0));

    // ===== MiniMax =====
    db.insert("minimax:minimax-m2.5".to_string(), ModelPricing::new(1.43, 5.71));
    db.insert("minimax:minimax-m2".to_string(), ModelPricing::new(0.71, 2.86));
    db.insert("minimax:minimax-m1.5".to_string(), ModelPricing::new(0.71, 0.71));
    db.insert("minimax:minimax-m0".to_string(), ModelPricing::new(0.014, 0.014));

    // ===== Mistral =====
    db.insert("mistral:mistral-large".to_string(), ModelPricing::new(2.0, 6.0));
    db.insert("mistral:mistral-small".to_string(), ModelPricing::new(0.2, 0.6));
    db.insert("mistral:mistral-nemo".to_string(), ModelPricing::new(0.15, 0.15));

    // Generic model-id rows (no provider prefix) for loose matching
    db.insert("glm-5".to_string(), ModelPricing::new(1.0, 3.2));
    db.insert("glm-5-plus".to_string(), ModelPricing::new(1.43, 5.71));
    db.insert("glm-5-air".to_string(), ModelPricing::new(0.14, 0.57));
    db.insert("qwen-max".to_string(), ModelPricing::with_cache(0.343, 1.371, 0.034, 0.0));
    db.insert("qwen-plus".to_string(), ModelPricing::with_cache(0.217, 0.543, 0.022, 0.0));
    db.insert("qwen-turbo".to_string(), ModelPricing::with_cache(0.043, 0.086, 0.004, 0.0));
    db.insert("deepseek-v3".to_string(), ModelPricing::with_cache(0.286, 0.429, 0.029, 0.0));
    db.insert("deepseek-r1".to_string(), ModelPricing::new(0.571, 2.286));
    db.insert("kimi-k2.5".to_string(), ModelPricing::new(4.0, 21.0));
    db.insert("gpt-4o".to_string(), ModelPricing::with_cache(2.5, 10.0, 1.25, 0.0));
    db.insert("gpt-4o-mini".to_string(), ModelPricing::with_cache(0.15, 0.6, 0.075, 0.0));
    db.insert("claude-sonnet-4".to_string(), ModelPricing::with_cache(3.0, 15.0, 0.3, 3.75));
    db.insert("claude-sonnet-3-5".to_string(), ModelPricing::with_cache(3.0, 15.0, 0.3, 3.75));
    db.insert("gemini-2.5-pro".to_string(), ModelPricing::with_cache(1.25, 5.0, 0.31, 1.25));
    db.insert("gemini-2.5-flash".to_string(), ModelPricing::with_cache(0.15, 0.6, 0.04, 0.15));

    db
});

/// Map OpenClaw provider strings to our canonical provider keys.
/// e.g. custom-dashscope-aliyuncs-com -> bailian
pub fn normalize_provider(openclaw_provider: &str) -> &str {
    match openclaw_provider {
        p if p.contains("dashscope") || p.contains("aliyuncs") => "bailian",
        p if p.contains("openai") => "openai",
        p if p.contains("anthropic") || p.contains("claude") => "anthropic",
        p if p.contains("google") || p.contains("gemini") => "google",
        p if p.contains("moonshot") || p.contains("kimi") => "moonshot",
        p if p.contains("deepseek") => "deepseek",
        p if p.contains("minimax") => "minimax",
        p if p.contains("mistral") => "mistral",
        p if p.contains("zhipu") || p.contains("glm") => "zhipu",
        _ => openclaw_provider,
    }
}

/// Look up pricing for provider + model id.
pub fn get_model_pricing(provider: &str, model_id: &str) -> Option<&'static ModelPricing> {
    let normalized_provider = normalize_provider(provider);
    let trimmed = model_id.trim();
    let prefix = format!("{}/", normalized_provider);
    let mid = if trimmed.len() > prefix.len() && trimmed[..prefix.len()].eq_ignore_ascii_case(&prefix) {
        &trimmed[prefix.len()..]
    } else {
        trimmed
    };

    let full_key = format!("{}:{}", normalized_provider, mid);
    if let Some(pricing) = MODEL_PRICING_DB.get(&full_key) {
        return Some(pricing);
    }
    if let Some(pricing) = MODEL_PRICING_DB.get(mid) {
        return Some(pricing);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_provider() {
        assert_eq!(normalize_provider("custom-dashscope-aliyuncs-com"), "bailian");
        assert_eq!(normalize_provider("openai"), "openai");
        assert_eq!(normalize_provider("anthropic"), "anthropic");
    }

    #[test]
    fn test_get_model_pricing() {
        // Full key lookup
        let pricing = get_model_pricing("zhipu", "glm-5").unwrap();
        assert_eq!(pricing.input, 1.0);
        assert_eq!(pricing.output, 3.2);

        // Provider alias + generic key
        let pricing2 = get_model_pricing("custom-dashscope-aliyuncs-com", "glm-5").unwrap();
        assert_eq!(pricing2.input, 1.0);

        // Bailian: duplicate provider prefix in model field still resolves
        let p = get_model_pricing("bailian", "bailian/minimax-m2.5").unwrap();
        assert_eq!(p.input, 0.3);
        assert!(get_model_pricing("bailian", "MiniMax-M2.5").is_some());

        assert!(get_model_pricing("unknown", "unknown-model").is_none());
    }

    #[test]
    fn test_calculate_cost() {
        let pricing = ModelPricing::new(1.0, 3.2);
        // 1000 input tokens = 0.001M * $1.0 = $0.001
        // 500 output tokens = 0.0005M * $3.2 = $0.0016
        let cost = pricing.calculate_cost(1000, 500, 0, 0);
        assert!((cost - 0.0026).abs() < 0.0001);
    }
}
