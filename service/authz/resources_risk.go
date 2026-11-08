package authz

const ResourceRisk = "risk"

var (
	RiskRead   = Permission{Resource: ResourceRisk, Action: "read"}
	RiskReview = Permission{Resource: ResourceRisk, Action: "review"}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceRisk,
		LabelKey: "Risk events",
		Actions: []ActionDefinition{
			{Action: "read", LabelKey: "View risk events", DescriptionKey: "View sensitive request events and review history."},
			{Action: "review", LabelKey: "Review risk events", DescriptionKey: "Confirm or dismiss sensitive request events and resolve appeals."},
		},
	})
}
