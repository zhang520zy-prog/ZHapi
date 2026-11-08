package authz

const ResourceRisk = "risk"

var (
	RiskRead   = Permission{Resource: ResourceRisk, Action: "read"}
	RiskReview = Permission{Resource: ResourceRisk, Action: "review"}
	RiskManage = Permission{Resource: ResourceRisk, Action: "manage"}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceRisk,
		LabelKey: "Risk events",
		Actions: []ActionDefinition{
			{Action: "read", LabelKey: "View risk events", DescriptionKey: "View sensitive request events and review history."},
			{Action: "review", LabelKey: "Review risk events", DescriptionKey: "Confirm or dismiss sensitive request events and resolve appeals."},
			{Action: "manage", LabelKey: "Manage risk word categories", DescriptionKey: "Create, edit, import and export sensitive word categories."},
		},
	})
}
