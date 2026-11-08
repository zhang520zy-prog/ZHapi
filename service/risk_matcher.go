package service

import (
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/model"
	goahocorasick "github.com/anknown/ahocorasick"
)

// RiskMatchCategory 命中时返回的类别信息；只含 Key/Name/Action，不含词。
type RiskMatchCategory struct {
	Id     int
	Key    string
	Name   string
	Action string
}

var riskActionSeverity = map[string]int{
	model.RiskWordActionBlockRestrict: 3,
	model.RiskWordActionBlock:         2,
	model.RiskWordActionRecord:        1,
}

type riskMatcher struct {
	signature string
	machine   *goahocorasick.Machine
	// 一个词可能属于多个类别，命中后取处置最重的类别。
	wordCategories map[string][]RiskMatchCategory
	maxWordRunes   int
}

var (
	riskMatcherMu   sync.RWMutex
	riskMatcherInst *riskMatcher
)

// riskCategorySignature 用启用类别的 Id:Version 生成缓存键，类别一改自动失效。
func riskCategorySignature(categories []model.RiskWordCategoryVersion) string {
	parts := make([]string, 0, len(categories))
	for _, c := range categories {
		parts = append(parts, fmt.Sprintf("%d:%d", c.Id, c.Version))
	}
	sort.Strings(parts)
	hasher := fnv.New64a()
	for _, p := range parts {
		hasher.Write([]byte{0})
		hasher.Write([]byte(p))
	}
	return fmt.Sprintf("%x", hasher.Sum64())
}

func buildRiskMatcher(signature string) (*riskMatcher, error) {
	categories, err := model.ListEnabledRiskWordCategories()
	if err != nil {
		return nil, err
	}
	matcher := &riskMatcher{signature: signature, wordCategories: make(map[string][]RiskMatchCategory)}
	dict := make([]string, 0, 256)
	for _, category := range categories {
		info := RiskMatchCategory{Id: category.Id, Key: category.Key, Name: category.Name, Action: category.Action}
		for _, word := range category.Words {
			if word == "" {
				continue
			}
			if _, ok := matcher.wordCategories[word]; !ok {
				dict = append(dict, word)
			}
			matcher.wordCategories[word] = append(matcher.wordCategories[word], info)
			if n := len([]rune(word)); n > matcher.maxWordRunes {
				matcher.maxWordRunes = n
			}
		}
	}
	if len(dict) == 0 {
		return matcher, nil
	}
	matcher.machine = InitAc(dict)
	return matcher, nil
}

// currentRiskMatcher 按启用类别的 Id:Version 签名取缓存；签名变了才重建。
// 未接库（单测/启动前）返回 nil，匹配按无命中处理。
func currentRiskMatcher() *riskMatcher {
	if model.DB == nil {
		return nil
	}
	versions, err := model.ListEnabledRiskCategoryVersions()
	if err != nil {
		return nil
	}
	signature := riskCategorySignature(versions)
	riskMatcherMu.RLock()
	if riskMatcherInst != nil && riskMatcherInst.signature == signature {
		m := riskMatcherInst
		riskMatcherMu.RUnlock()
		return m
	}
	riskMatcherMu.RUnlock()

	riskMatcherMu.Lock()
	defer riskMatcherMu.Unlock()
	if riskMatcherInst != nil && riskMatcherInst.signature == signature {
		return riskMatcherInst
	}
	m, err := buildRiskMatcher(signature)
	if err != nil {
		return nil
	}
	riskMatcherInst = m
	return m
}

// InvalidateRiskMatcher 测试与导入后主动失效缓存（签名机制已覆盖，这里兜底）。
func InvalidateRiskMatcher() {
	riskMatcherMu.Lock()
	riskMatcherInst = nil
	riskMatcherMu.Unlock()
}

// pickHeaviestCategory 处置最重者优先：block_restrict > block > record；
// 同级取 Key 字典序最小，保证结果稳定。
func pickHeaviestCategory(categories []RiskMatchCategory) *RiskMatchCategory {
	var best *RiskMatchCategory
	for i := range categories {
		c := &categories[i]
		if best == nil ||
			riskActionSeverity[c.Action] > riskActionSeverity[best.Action] ||
			(riskActionSeverity[c.Action] == riskActionSeverity[best.Action] && c.Key < best.Key) {
			best = c
		}
	}
	return best
}

// matchRiskCategories 返回文本命中的所有候选类别（去重后）。
func matchRiskCategories(m *riskMatcher, text string) *RiskMatchCategory {
	if m == nil || m.machine == nil || len(text) == 0 {
		return nil
	}
	hits := m.machine.MultiPatternSearch([]rune(strings.ToLower(text)), false)
	if len(hits) == 0 {
		return nil
	}
	var best *RiskMatchCategory
	seen := make(map[int]struct{})
	for _, hit := range hits {
		categories, ok := m.wordCategories[string(hit.Word)]
		if !ok {
			continue
		}
		candidate := pickHeaviestCategory(categories)
		if candidate == nil {
			continue
		}
		if _, dup := seen[candidate.Id]; !dup {
			seen[candidate.Id] = struct{}{}
		}
		if best == nil ||
			riskActionSeverity[candidate.Action] > riskActionSeverity[best.Action] ||
			(riskActionSeverity[candidate.Action] == riskActionSeverity[best.Action] && candidate.Key < best.Key) {
			copyOf := *candidate
			best = &copyOf
		}
	}
	return best
}

// MatchRisk 匹配文本，返回处置最重的类别；无命中返回 nil。
func MatchRisk(text string) *RiskMatchCategory {
	return matchRiskCategories(currentRiskMatcher(), text)
}

// riskMatcherMaxWordLen 返回当前启用词表的最长词（rune 数），StreamGuard 用。
func riskMatcherMaxWordLen() int {
	m := currentRiskMatcher()
	if m == nil {
		return 0
	}
	return m.maxWordRunes
}
