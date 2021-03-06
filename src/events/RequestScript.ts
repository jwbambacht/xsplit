import { XRPUtil } from "../util/XRPUtil";
import {CookieUtil} from "../util/CookieUtil";

let participants: string[] = [];
let groupId: string = undefined;

function newUserRow(username: string): string {
	let element = "<div class='form-row user-row mb-2' data-user='"+username+"'>";
		element += "<div class='col-6 col-lg-7 line-height'>"+username+"<img src='/assets/img/remove.svg' class='remove-user ml-2' width='15' height='15' /></div>";
		element += "<div class='col-3 col-lg-3 line-height user-amount text-right'></div>";
		element += "<div class='col-3 col-lg-2'>";
		element += "<select class='form-group form-control selectpicker border-0' data-id='"+username+"' id='select-"+username+"'>";
		for (let i = 1; i <= 10; i++) {
			element += "<option value='"+i+"'>"+i+"x</option>";
		}
		element += "</select>";
		element += "</div>";
		element += "</div>";

	return element;
}

async function updateSummary(): Promise<void> {
	const currentUsername = await CookieUtil.getUsername();

	if((participants.length === 1 && participants[0] === currentUsername) || participants.length === 0) {
		$(".summary").addClass("d-none");
		$(".submit-request").attr("disabled","disabled");
	}else{
		const nAmount = $("#amount").val();

		$(".submit-request").removeAttr("disabled");

		$(".summary").removeClass("d-none");
		$(".nFriends").html(String(participants.length));
		$(".nAmount").html(String(Number(nAmount)));
	}

	$("#subject").trigger("change");
}

async function sendBill(subject: string, amount: number, weights: number[]): Promise<void> {
	let url = "/api/bills";
	let method = "POST";
	if (groupId !== undefined) {
		url = `/api/groups/${groupId}/bill`;
		method = "PUT";
	}
	const response = await fetch(url, {
		method: method,
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			description: subject,
			totalXrpDrops: XRPUtil.XRPtoDrops(amount),
			participants: participants,
			weights: weights
		})
	});
	if (response.status !== 200) {
		console.error(response.status);
		$("#bill-success").hide().empty();
		$("#bill-error").fadeIn();
		$("#bill-error").html("Bill couldn't be created, try again.");
		return;
	}

	$("#submitBill").text("Send");

	$("#bill-error").hide().empty();
	$("#bill-success").fadeIn().html('Bill created and sent to users!');

	$("#request-form").trigger('reset');
	$(".added-users").empty();
	
	participants = [];
	
	await updateSummary();
}

function onRequestPageLoad(): void {

	jQuery(($) => {
		const group = $("#groupId")[0].innerHTML;
		groupId = group === "" ? undefined : group as string;

		$(document).on("focus click", "input", function() {
			$("#bill-success").hide().empty();
			$("#bill-error").hide().empty();
		});

		$(document).on("click", ".remove-user", async function() {
			const userRow = $(this).closest(".user-row");

			const currentUsername = await CookieUtil.getUsername();
			const username = userRow.attr('data-user');

			if(username == currentUsername) {
				$("#includeCheck").prop("checked",false);
			}

			userRow.remove();

			participants = participants.filter(u => u !== username);

			await updateSummary();

		});

		$(document).on("change", "#includeCheck", async function() {
			
			const username: string = await CookieUtil.getUsername();

			if(this.checked) {
				$(".added-users").prepend(newUserRow(username));

				participants.push(username);

				$('select').selectpicker();
			}else{
				$(".user-row[data-user='"+username+"']").remove();

				participants = participants.filter(u => u !== username);
			}
			
			await updateSummary();
		});

		$(document).on("change",".selectpicker, #includeCheck, #amount, #subject", function() {

			const nFriends = participants.length;
			const nAmount = $("#amount").val();
			const includeCheck = $("#includeCheck");

			if(Number(nAmount) > 0 && Number(nFriends) > 0) {
				
				if(String($("#subject").val()).length === 0 || (Number(nFriends) === 1 && includeCheck.is(":checked"))) {
					$(".submit-request").attr("disabled","disabled");
				}else{
					$(".submit-request").removeAttr("disabled");
					$(".summary").removeClass("d-none");
					$(".nFriends").html(String(nFriends));
					$(".nAmount").html(String(Number(nAmount)));
				}
			}else{
				$(".summary").addClass("d-none");
				$(".submit-request").attr("disabled","disabled");
			}
		});

		$("#user-search").autocomplete({
			minLength: 2,
			// eslint-disable-next-line
			source: function(request: any, response: Function) {
				$.ajax({
					type: "GET",
					url: "/api/users/search/"+request.term + (groupId !== undefined ? "/" + groupId : ""),
					success: function(data) {
						response(data);
					}
				});
			},
			// eslint-disable-next-line
			select: async function (event: object, ui: any) {
				const added = $("div.user-row[data-user='"+ui.item.label+"']");

				if(added.length == 0) {
					const username = await CookieUtil.getUsername();
					
					if(ui.item.label == username) {
						$("#includeCheck").prop("checked",true);
						$(".added-users").prepend(newUserRow(ui.item.label));
					}else{
						$(".added-users").append(newUserRow(ui.item.label));
					}

					participants.push(ui.item.label);

					$("#user-search").val("");
					$('select').selectpicker();

					await updateSummary();
				}
				return false;
			}
		});

		$(document).on("click", ".submit-request", async function(e) {
			e.preventDefault();

			$("#submitBill").text("Creating bill...");

			const weights: number[] = [];

			for(const p of participants) {
				const weight = $("#select-"+p).val();
				weights.push(Number(weight));
			}

			const nAmount = Number($("#amount").val());
			const subject = String($("#subject").val());

			sendBill(subject, nAmount, weights);

		});
	});
}

document.addEventListener("DOMContentLoaded", onRequestPageLoad);