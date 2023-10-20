output "nlb_arn" {
  value = "${aws_lb.aztec-network.arn}"
}

output "alb_arn" {
  value = "${aws_alb.aztec-network-alb.arn}"
}

output "nlb_dns" {
  value = "${aws_lb.aztec-network.dns_name}"
}

output "p2p_security_group_id" {
  value = "${aws_security_group.security-group-p2p.id}"
}
